import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import cookieParser from "cookie-parser";
import { Availability, LegacyCity, FormalizationStatus, Prisma, ProviderStatus } from "@prisma/client";
import { extractIntent } from "./src/lib/ai/extract-intent";
import { rankProviders } from "./src/lib/ai/rank-providers";
import { generateQuoteDraft } from "./src/lib/ai/quote-draft";
import { generateEnhancedBio } from "./src/lib/ai/enhance-bio";
import { cityToEnum, normalizeCity } from "./src/lib/ai/category-mapping";
import { classifyGeminiError } from "./src/lib/ai/classify-error";
import {
  quoteDraftRequestSchema,
  quoteRequestSchema,
  searchProviderSchema,
  aiSearchProviderSchema,
  enhanceBioSchema,
  formalizationUpdateSchema,
  registerSchema,
  loginSchema,
  providerCreateSchema,
  providerModerationReasonSchema,
  providerSuspendSchema,
  quoteMessageSchema,
  quoteUpdateSchema,
  quoteCompletionSchema,
  quoteAcceptanceSchema,
  reviewCreateSchema,
  reviewUpdateSchema,
  riskReportEscalateSchema,
  riskReportQuerySchema,
  riskReportStatusSchema,
} from "./src/lib/api-schema";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromRequest,
  getRefreshTokenExpiryDate,
  generateSecureToken,
  setOAuthStateCookie,
  COOKIES,
  type TokenPayload,
} from "./src/lib/auth";
import { prisma } from "./src/lib/db";
import cron from "node-cron";
import { resolveExpiredQuotes } from "./src/lib/cron/resolve-expired-quotes";
import { recalculateProviderTrustScore } from "./src/lib/trust-score-service";
import { analyzeProviderRisk } from "./src/lib/risk-telemetry-service";
import { checkReviewEligibility } from "./src/domain/requests/reviewRules";
import {
  searchProviders,
  getFullProviderByIdOrSlug,
  updateProvider as updateProviderService,
  getProviderMapData,
  canReceiveQuotes,
  isPubliclyVisible,
  assertCanTransition,
  canTransition,
  PROVIDER_STATUSES,
  PUBLICLY_VISIBLE_STATUSES,
} from "./src/lib/providers-service";
import {
  searchCatalogItems,
  getCatalogItem,
} from "./src/lib/catalog-service";
import {
  getThreadsByProvider,
  getThreadsBySender,
  getThreadsForParticipant,
  createThread,
  getThreadById,
  addMessage,
  updateThread,
  updateThreadWithLocking,
  ConcurrencyError,
  rejectCompletion,
  withdrawCompletion,
  validateNotExpired,
} from "./src/lib/quotes-service";
import { emitRequestEvent } from "./src/lib/request-events-service.js";
import { createReputationEvidence } from "./src/lib/reputation-events-service.js";
import { createLogger } from "./src/lib/logger.js";

const log = createLogger('Server');
function normalizeAvailability(value: unknown): Availability {
  return Object.values(Availability).includes(value as Availability) ? value as Availability : Availability.DISPONIBLE;
}

/**
 * @deprecated Decision D-17: formalizationStatus is a RESERVED field.
 * This function remains for seed compatibility but has no MVP effect.
 */
function normalizeFormalizationStatus(value: unknown): FormalizationStatus {
  return Object.values(FormalizationStatus).includes(value as FormalizationStatus) ? value as FormalizationStatus : FormalizationStatus.INFORMAL;
}

function slugifyProviderName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "proveedor";
}

const cityMetadata: Record<LegacyCity, { city: string; department: string }> = {
  [LegacyCity.MANAGUA]: { city: "Managua", department: "Managua" },
  [LegacyCity.LEON]: { city: "Leon", department: "Leon" },
  [LegacyCity.GRANADA]: { city: "Granada", department: "Granada" },
  [LegacyCity.MASAYA]: { city: "Masaya", department: "Masaya" },
  [LegacyCity.ESTELI]: { city: "Esteli", department: "Esteli" },
  [LegacyCity.MATAGALPA]: { city: "Matagalpa", department: "Matagalpa" },
  [LegacyCity.BLUEFIELDS]: { city: "Bluefields", department: "RACCS" },
  [LegacyCity.JUIGALPA]: { city: "Juigalpa", department: "Chontales" },
  [LegacyCity.NAGAROTE]: { city: "Nagarote", department: "Leon" },
  [LegacyCity.SAN_JUAN_DE_ORIENTE]: { city: "San Juan de Oriente", department: "Masaya" },
};

async function ensureCityReference(legacyCode: LegacyCity) {
  const meta = cityMetadata[legacyCode];
  const departmentSlug = slugifyProviderName(meta.department);
  const citySlug = slugifyProviderName(meta.city);
  const department = await prisma.department.upsert({
    where: { slug: departmentSlug },
    update: { name: meta.department },
    create: { name: meta.department, slug: departmentSlug },
  });
  return prisma.city.upsert({
    where: { slug: citySlug },
    update: { name: meta.city, departmentId: department.id, legacyCode },
    create: { name: meta.city, slug: citySlug, departmentId: department.id, legacyCode },
  });
}

async function ensureCategoryReference(name: string, parentCategoryId?: string | null) {
  const slug = slugifyProviderName(name);
  return prisma.category.upsert({
    where: { slug },
    update: { name, parentCategoryId: parentCategoryId ?? null },
    create: { name, slug, parentCategoryId: parentCategoryId ?? null },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body Parsing Middleware
  app.use(express.json());
  app.use(cookieParser());

  // === AUTH MIDDLEWARE ===
  const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const accessToken = req.cookies?.access_token;
    if (!accessToken) {
      return res.status(401).json({ success: false, error: "No autenticado" });
    }
    const payload = verifyAccessToken(accessToken);
    if (!payload) {
      return res.status(401).json({ success: false, error: "Sesión expirada" });
    }
    req.user = payload;
    next();
  };

  // === IDEMPOTENCY MIDDLEWARE ===
  interface IdempotencyCache {
    response: any;
    statusCode: number;
    timestamp: number;
  }

  const idempotencyStore = new Map<string, IdempotencyCache>();
  const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

  function cleanupExpiredIdempotencyKeys() {
    const now = Date.now();
    for (const [key, value] of idempotencyStore.entries()) {
      if (now - value.timestamp > IDEMPOTENCY_TTL_MS) {
        idempotencyStore.delete(key);
      }
    }
  }

  setInterval(cleanupExpiredIdempotencyKeys, 60 * 60 * 1000);

  const idempotencyMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    
    if (!idempotencyKey) {
      return next();
    }

    const cached = idempotencyStore.get(idempotencyKey);
    if (cached) {
      log.info('Idempotent request detected, returning cached response', {
        key: idempotencyKey,
        method: req.method,
        path: req.path,
      });
      return res.status(cached.statusCode).json(cached.response);
    }

    const originalJson = res.json.bind(res);
    res.json = function(body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        idempotencyStore.set(idempotencyKey, {
          response: body,
          statusCode: res.statusCode,
          timestamp: Date.now(),
        });
        log.info('Cached idempotent response', {
          key: idempotencyKey,
          statusCode: res.statusCode,
        });
      }
      return originalJson(body);
    };

    next();
  };

  async function getProviderOwnedByUser(providerId: string, userId: string) {
    return prisma.provider.findFirst({
      where: { id: providerId, userId },
      select: { id: true },
    });
  }

  async function getThreadParticipantRole(threadId: string, userId: string) {
    const thread = await prisma.quoteThread.findUnique({
      where: { id: threadId },
      include: {
        provider: { select: { id: true, userId: true } },
      },
    });

    if (!thread) return { thread: null, role: null as "client" | "provider" | null };
    if (thread.senderId === userId) return { thread, role: "client" as const };
    if (thread.provider.userId === userId) return { thread, role: "provider" as const };
    return { thread, role: null as "client" | "provider" | null };
  }

  async function getUserSystemRoles(userId: string): Promise<Set<string>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        roleAssignments: { select: { role: true } },
      },
    });

    const roles = new Set<string>();
    if (user?.role) roles.add(user.role);
    user?.roleAssignments.forEach((assignment) => roles.add(assignment.role));
    return roles;
  }

  const requireAdminReviewerOrSuperAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { userId } = req.user;
    const roles = await getUserSystemRoles(userId);
    if (roles.has("ADMIN") || roles.has("ADMIN_REVIEWER") || roles.has("SUPER_ADMIN")) {
      return next();
    }
    return res.status(403).json({ success: false, error: "Necesitás permisos de revisión administrativa" });
  };

  const requireSuperAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { userId } = req.user;
    const roles = await getUserSystemRoles(userId);
    if (roles.has("SUPER_ADMIN")) {
      return next();
    }
    return res.status(403).json({ success: false, error: "Solo super administración puede ejecutar esta acción" });
  };

  async function createModerationAuditLog(data: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.moderationAuditLog.create({
      data: {
        actor: { connect: { id: data.actorUserId } },
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // ──────────────────────────────────────────────────────────
  // AUTH ROUTES
  // ──────────────────────────────────────────────────────────

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Datos inválidos",
          details: parsed.error.issues.map(i => i.message),
        });
      }

      const { name, email, password } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: "Este correo ya está registrado",
        });
      }

      const hashedPassword = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "USER",
        },
        select: { id: true, email: true, name: true, role: true },
      });

      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: getRefreshTokenExpiryDate(),
        },
      });

      await prisma.roleAssignment.create({
        data: { userId: user.id, role: "REQUESTER" },
      });

      setAuthCookies(res, accessToken, refreshToken);

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            roleLabels: [user.role, "REQUESTER"],
            providers: [],
            providerProfileId: null,
            emailVerified: null,
            createdAt: new Date(),
          },
        },
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ success: false, error: "Error al registrar usuario" });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Datos inválidos",
          details: parsed.error.issues.map(i => i.message),
        });
      }

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          password: true,
          emailVerified: true,
          createdAt: true,
          roleAssignments: { select: { role: true } },
          providers: {
            select: {
              id: true,
              displayName: true,
              slug: true,
              verified: true,
              formalizationStatus: true,
              status: true,
              statusReason: true,
              suspendedUntil: true,
            },
          },
        },
      });

      if (!user || !user.password) {
        return res.status(401).json({
          success: false,
          error: "Credenciales inválidas",
        });
      }

      const valid = await verifyPassword(password, user.password);
      if (!valid) {
        return res.status(401).json({
          success: false,
          error: "Credenciales inválidas",
        });
      }

      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: getRefreshTokenExpiryDate(),
        },
      });

      setAuthCookies(res, accessToken, refreshToken);
      const roleLabels = Array.from(new Set([user.role, ...user.roleAssignments.map((assignment) => assignment.role)]));

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
            providers: user.providers,
            roleLabels,
            providerProfileId: user.providers[0]?.id ?? null,
          },
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ success: false, error: "Error al iniciar sesión" });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);
      if (refreshToken) {
        await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
      }
      clearAuthCookies(res);
      res.json({ success: true, message: "Sesión cerrada" });
    } catch (error) {
      clearAuthCookies(res);
      res.json({ success: true, message: "Sesión cerrada" });
    }
  });

  // POST /api/auth/refresh
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const incomingRefreshToken = getRefreshTokenFromRequest(req);
      if (!incomingRefreshToken) {
        return res.status(401).json({ success: false, error: "No hay refresh token" });
      }

      const payload = verifyRefreshToken(incomingRefreshToken);
      if (!payload) {
        return res.status(401).json({ success: false, error: "Refresh token inválido o expirado" });
      }

      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: incomingRefreshToken },
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        return res.status(401).json({ success: false, error: "Refresh token expirado" });
      }

      await prisma.refreshToken.delete({ where: { token: incomingRefreshToken } });

      const newPayload: TokenPayload = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
      };

      const newAccessToken = generateAccessToken(newPayload);
      const newRefreshToken = generateRefreshToken(newPayload);

      await prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: payload.userId,
          expiresAt: getRefreshTokenExpiryDate(),
        },
      });

      setAuthCookies(res, newAccessToken, newRefreshToken);

      res.json({ success: true, message: "Tokens renovados" });
    } catch (error) {
      console.error("Refresh error:", error);
      res.status(500).json({ success: false, error: "Error al renovar la sesión" });
    }
  });

  // GET /api/auth/me
  app.get("/api/auth/me", authenticate, async (req, res) => {
    try {
      const { userId } = req.user;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          emailVerified: true,
          createdAt: true,
          roleAssignments: { select: { role: true } },
          providers: {
            select: {
              id: true,
              displayName: true,
              slug: true,
              verified: true,
              formalizationStatus: true,
              status: true,
              statusReason: true,
              suspendedUntil: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ success: false, error: "Usuario no encontrado" });
      }

      const roleLabels = Array.from(new Set([user.role, ...user.roleAssignments.map((assignment) => assignment.role)]));
      res.json({
        success: true,
        data: {
          user: {
            ...user,
            roleLabels,
            providerProfileId: user.providers[0]?.id ?? null,
          },
        },
      });
    } catch (error) {
      console.error("Me error:", error);
      res.status(500).json({ success: false, error: "Error al obtener usuario" });
    }
  });

  // GET /api/auth/google — initiate OAuth
  app.get("/api/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.APP_URL || "http://localhost:3000";

    if (!clientId || !clientSecret) {
      return res.status(503).json({
        success: false,
        error:
          "El acceso con Google no está disponible por ahora. El administrador debe configurar las credenciales de Google (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).",
      });
    }

    const redirectUri = `${appUrl}/api/auth/google/callback`;
    const state = generateSecureToken();

    setOAuthStateCookie(res, state);

    const authUrl = [
      "https://accounts.google.com/o/oauth2/v2/auth",
      `?client_id=${encodeURIComponent(clientId)}`,
      `&redirect_uri=${encodeURIComponent(redirectUri)}`,
      "&response_type=code",
      "&scope=openid email profile",
      "&access_type=offline",
      "&prompt=consent",
      `&state=${encodeURIComponent(state)}`,
    ].join("");

    res.redirect(authUrl);
  });

  // GET /api/auth/google/callback — handle OAuth
  app.get("/api/auth/google/callback", async (req, res) => {
    const { code, error, state } = req.query;
    const appUrl = process.env.APP_URL || "http://localhost:3000";

    const redirectToLogin = (errorCode: string) =>
      res.redirect(`${appUrl}/auth/login?error=${errorCode}`);

    if (error) {
      return redirectToLogin("oauth_cancelled");
    }

    if (!code) {
      return redirectToLogin("oauth_failed");
    }

    const expectedState = req.cookies?.[COOKIES.OAUTH_STATE];
    res.clearCookie(COOKIES.OAUTH_STATE, { path: "/" });

    if (!expectedState || typeof state !== "string" || state !== expectedState) {
      return redirectToLogin("oauth_state_invalid");
    }

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const redirectUri = `${appUrl}/api/auth/google/callback`;

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        return redirectToLogin("oauth_token_failed");
      }

      const tokenData = await tokenResponse.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
        id_token?: string;
      };

      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );

      if (!userInfoResponse.ok) {
        return redirectToLogin("oauth_userinfo_failed");
      }

      const googleUser = await userInfoResponse.json() as {
        id: string;
        email: string;
        name?: string;
        picture?: string;
      };

      let user = await prisma.user.findUnique({ where: { email: googleUser.email } });

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: googleUser.name || undefined,
            image: googleUser.picture || undefined,
            emailVerified: user.emailVerified ?? new Date(),
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: googleUser.email,
            name: googleUser.name || googleUser.email.split("@")[0],
            image: googleUser.picture,
            emailVerified: new Date(),
          },
        });
      }

      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: googleUser.id,
          },
        },
        update: {
          access_token: tokenData.access_token,
          ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
          ...(tokenData.expires_in ? { expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in } : {}),
          ...(tokenData.scope ? { scope: tokenData.scope } : {}),
          ...(tokenData.token_type ? { token_type: tokenData.token_type } : {}),
          ...(tokenData.id_token ? { id_token: tokenData.id_token } : {}),
        },
        create: {
          userId: user.id,
          provider: "google",
          providerAccountId: googleUser.id,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? null,
          expires_at: tokenData.expires_in
            ? Math.floor(Date.now() / 1000) + tokenData.expires_in
            : null,
          token_type: tokenData.token_type ?? null,
          scope: tokenData.scope ?? null,
          id_token: tokenData.id_token ?? null,
        },
      });

      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: getRefreshTokenExpiryDate(),
        },
      });

      setAuthCookies(res, accessToken, refreshToken);

      res.redirect(`${appUrl}/`);
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect(`${appUrl}/auth/login?error=oauth_server_error`);
    }
  });

  // === API ROUTES (Mounted FIRST) ===
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // GET Providers Search
  app.get("/api/providers/search", async (req, res) => {
    try {
      const parsed = searchProviderSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: "Parámetros de búsqueda inválidos", details: parsed.error.issues });
      }
      const { q, city } = parsed.data;

      const results = await searchProviders({
        q: Array.isArray(q) ? q[0] : q,
        city,
      });

      res.json({ success: true, data: results });
    } catch (error) {
      console.error("Provider search error:", error);
      res.status(500).json({ success: false, error: "Error al buscar proveedores" });
    }
  });

  // POST Providers AI Search
  app.post("/api/providers/ai-search", async (req, res) => {
    try {
      const parsed = aiSearchProviderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Solicitud inválida", details: parsed.error.issues });
      }
      const { query } = parsed.data;

      const intent = await extractIntent(query);

      const providers = await searchProviders({
        city: intent.city || undefined,
        intent,
      });

      const { scores: aiScores, usedAi } = await rankProviders(query, providers);

      const ranked = providers.map((p) => {
        const aiScore = aiScores[p.id] ?? 0;
        const trustScore = p.trustScore ?? 0;

        const availabilityScore = p.availability === "DISPONIBLE" ? 100
          : p.availability === "OCUPADO" ? 50
            : p.availability === "BAJO_PEDIDO" ? 25 : 0;

        const proximityScore = intent.city
          ? p.city.toLowerCase().includes(intent.city.toLowerCase()) ? 100 : 30
          : 70;

        const finalScore = Math.round(
          0.50 * aiScore +
          0.20 * trustScore +
          0.15 * availabilityScore +
          0.15 * proximityScore
        );

        return { ...p, finalScore };
      });

      ranked.sort((a, b) => b.finalScore - a.finalScore);

      res.json({ success: true, intent, usedAi, data: ranked });

    } catch (error) {
      const c = classifyGeminiError(error);
      if (c.kind === "rate_limit") {
        console.warn("[ai-search] Rate limit de Gemini (429)", { retryAfterMs: c.retryAfterMs });
        if (c.retryAfterMs) res.setHeader("Retry-After", String(Math.ceil(c.retryAfterMs / 1000)));
        return res.status(503).json({ success: false, error: "Demasiadas búsquedas en este momento. Intentalo en unos segundos.", retry: true });
      }
      if (c.kind === "unavailable") {
        console.info("[ai-search] Gemini no disponible (503/5xx)");
        return res.status(503).json({ success: false, error: "El servicio de IA no está disponible. Probá en un momento.", retry: true });
      }
      if (c.kind === "aborted") {
        console.warn("[ai-search] Búsqueda abortada (timeout/usuario)");
        return res.status(499).json({ success: false, error: "Búsqueda cancelada", retry: false });
      }
      console.error("[ai-search] Error inesperado:", error);
      res.status(500).json({ success: false, error: "Error en búsqueda IA" });
    }
  });

  // GET Provider by id OR slug (spec §26.1)
  app.get("/api/providers/:id", async (req, res) => {
    try {
      const full = await getFullProviderByIdOrSlug(req.params.id);
      if (!full) return res.status(404).json({ success: false, message: "No encontrado" });

      // Visibility gate: non-public statuses are only visible to owner or admin reviewers/super admins.
      if (!isPubliclyVisible(full.provider.status)) {
        const accessToken = req.cookies?.access_token;
        const payload = accessToken ? verifyAccessToken(accessToken) : null;
        const callerUserId = payload?.userId;
        const callerRoles = callerUserId ? await getUserSystemRoles(callerUserId) : new Set<string>();
        const isOwner = callerUserId && full.provider.userId === callerUserId;
        const isModerator = callerRoles.has("ADMIN") || callerRoles.has("ADMIN_REVIEWER") || callerRoles.has("SUPER_ADMIN");
        if (!isOwner && !isModerator) {
          return res.status(404).json({ success: false, message: "Este proveedor no está disponible públicamente" });
        }
        return res.json({ success: true, data: full, preview: true });
      }

      res.json({ success: true, data: full });
    } catch (error) {
      console.error("Get provider error:", error);
      res.status(500).json({ success: false, error: "Error al obtener proveedor" });
    }
  });

  // GET Quotes — default returns every thread where the authenticated user participates.
  // Legacy ?providerId= and ?senderId= remain guarded for narrow views.
  app.get("/api/quotes", authenticate, async (req, res) => {
    try {
      const providerId = req.query.providerId as string | undefined;
      const senderId = req.query.senderId as string | undefined;
      const { userId } = req.user;

      if (senderId) {
        if (senderId !== userId) {
          return res.status(403).json({ success: false, error: "No tenés permiso para ver estas solicitudes" });
        }
        const threads = await getThreadsBySender(senderId);
        return res.json({ success: true, data: threads });
      }

      if (providerId) {
        const ownsProvider = await getProviderOwnedByUser(providerId, userId);
        if (!ownsProvider) {
          return res.status(403).json({ success: false, error: "No tenés permiso para ver solicitudes de este proveedor" });
        }
        const threads = await getThreadsByProvider(providerId);
        return res.json({ success: true, data: threads });
      }

      const threads = await getThreadsForParticipant(userId);
      res.json({ success: true, data: threads });
    } catch (error) {
      console.error("Get quotes error:", error);
      res.status(500).json({ success: false, error: "Error al obtener cotizaciones" });
    }
  });

  app.get("/api/quotes/:id", authenticate, async (req, res) => {
    try {
      const threadId = req.params.id;
      const { userId } = req.user;
      const { thread, role } = await getThreadParticipantRole(threadId, userId);

      if (!thread) {
        return res.status(404).json({ success: false, error: "Solicitud no encontrada" });
      }
      if (!role) {
        return res.status(403).json({ success: false, error: "No participás en esta solicitud" });
      }

      const data = await getThreadById(threadId);
      res.json({ success: true, data });
    } catch (error) {
      console.error("Get quote error:", error);
      res.status(500).json({ success: false, error: "Error al obtener solicitud" });
    }
  });

  // POST Generate AI Quote Draft (Left intact as it hits external API or mocked local)
  app.post("/api/quotes/draft", authenticate, async (req, res) => {
    try {
      const parsed = quoteDraftRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Campos inválidos", details: parsed.error.issues });
      }
      const { idea, providerName } = parsed.data;

      const draft = await generateQuoteDraft(idea, providerName);
      res.json({ success: true, draft });
    } catch (error) {
      res.status(500).json({ error: "Ocurrió un error al intentar redactar la cotización. Por favor, intenta de nuevo." });
    }
  });

  // POST Request Quote — creates a new quote thread
  app.post("/api/quotes", authenticate, idempotencyMiddleware, async (req, res) => {
    try {
      const parsed = quoteRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Faltan campos obligatorios", details: parsed.error.issues });
      }

      const { providerId, subject, body, catalogItemId } = parsed.data;

      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: { id: true, userId: true, status: true, statusReason: true, suspendedUntil: true },
      });

      if (!provider) {
        return res.status(404).json({ success: false, error: "Proveedor no encontrado" });
      }

      if (provider.userId === req.user.userId) {
        return res.status(409).json({
          success: false,
          error: "No podés solicitar una cotización a tu propio perfil.",
        });
      }

      if (!canReceiveQuotes(provider.status)) {
        const statusMessages: Partial<Record<ProviderStatus, string>> = {
          DRAFT: "Este proveedor está en borrador y no puede recibir solicitudes todavía.",
          INACTIVE: "Este proveedor está inactivo y no puede recibir solicitudes.",
          SUSPENDED: "Este proveedor está suspendido temporalmente y no puede recibir nuevas solicitudes.",
          BANNED: "Este proveedor está baneado y no puede recibir nuevas solicitudes.",
          ACTIVE: "",
        };
        return res.status(403).json({
          success: false,
          error: statusMessages[provider.status] || "Este proveedor no puede recibir solicitudes en este momento.",
        });
      }

      if (catalogItemId) {
        const catalogItem = await prisma.catalogItem.findFirst({
          where: { id: catalogItemId, providerId },
          select: { id: true },
        });

        if (!catalogItem) {
          return res.status(400).json({
            success: false,
            error: "El producto seleccionado no pertenece a este proveedor.",
          });
        }
      }

      // For authenticated requests, use the authenticated user as sender
      // For now, use a default senderId (will be replaced when auth is connected)
      const senderId = req.user.userId;

      const newQuote = await createThread({
        senderId,
        providerId,
        catalogItemId,
        subject: subject || "Solicitud de cotización",
        initialMessage: body,
      });

      res.status(201).json({ success: true, data: newQuote });
    } catch (error) {
      console.error("Create quote error:", error);
      res.status(500).json({ success: false, error: "Error al crear cotización" });
    }
  });

  // POST Message to Quote Thread
  app.post("/api/quotes/:id/messages", authenticate, async (req, res) => {
    try {
      const threadId = req.params.id;
      const parsed = quoteMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "El mensaje es inválido", details: parsed.error.issues });
      const { text } = parsed.data;
      const { userId } = req.user;

      const { thread, role } = await getThreadParticipantRole(threadId, userId);

      if (!thread) {
        return res.status(404).json({ success: false, error: "Solicitud no encontrada" });
      }

      if (!role) {
        return res.status(403).json({ success: false, error: "No participás en esta solicitud" });
      }

      const newMsg = await addMessage(threadId, {
        authorId: userId,
        authorRole: role,
        body: text,
      });

      res.status(201).json({ success: true, data: newMsg });
    } catch (error) {
      console.error("Add message error:", error);
      res.status(500).json({ success: false, error: "Error al agregar mensaje" });
    }
  });

  // PUT Update Quote Thread Status
  app.put("/api/quotes/:id", authenticate, async (req, res) => {
    try {
      const threadId = req.params.id;
      const parsed = quoteUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "La actualización es inválida", details: parsed.error.issues });
      const {
        status,
        quotedPriceLabel,
        quotedDeliveryTime,
        confirmedByRequesterAt,
        confirmedByProviderAt,
      } = parsed.data;
      const { userId } = req.user;

      const { thread, role } = await getThreadParticipantRole(threadId, userId);

      if (!thread) {
        return res.status(404).json({ success: false, error: "Solicitud no encontrada" });
      }

      if (!role) {
        return res.status(403).json({ success: false, error: "No participás en esta solicitud" });
      }

      if ((quotedPriceLabel !== undefined || quotedDeliveryTime !== undefined) && role !== "provider") {
        return res.status(403).json({ success: false, error: "Solo el proveedor puede enviar una cotización" });
      }

      if (confirmedByRequesterAt && role !== "client") {
        return res.status(403).json({ success: false, error: "Solo el solicitante puede confirmar esta parte" });
      }

      if (confirmedByProviderAt && role !== "provider") {
        return res.status(403).json({ success: false, error: "Solo el proveedor puede confirmar esta parte" });
      }

      if (status === "CLOSED_PROVIDER" && role !== "provider") {
        return res.status(403).json({ success: false, error: "Solo el proveedor puede cerrar su parte" });
      }

      if (status === "CLOSED_REQUESTER" && role !== "client") {
        return res.status(403).json({ success: false, error: "Solo el solicitante puede cerrar su parte" });
      }

      const updated = await updateThread(threadId, {
        status,
        quotedPriceLabel,
        quotedDeliveryTime,
        confirmedByRequesterAt: Boolean(confirmedByRequesterAt),
        confirmedByProviderAt: Boolean(confirmedByProviderAt),
      });

      // ✅ Auditoría: cada cotización enviada por el proveedor se agrega al historial (append-only)
      if ((quotedPriceLabel !== undefined || quotedDeliveryTime !== undefined) && role === "provider") {
        const currentHistory = (thread.quotationHistory as any[] | null) || [];
        await prisma.quoteThread.update({
          where: { id: threadId },
          data: {
            quotationHistory: [
              ...currentHistory,
              {
                price: quotedPriceLabel ?? thread.quotedPriceLabel,
                delivery: quotedDeliveryTime ?? thread.quotedDeliveryTime,
                providerId: userId,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        });
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Update quote error:", error);
      res.status(500).json({ success: false, error: "Error al actualizar cotización" });
    }
  });

  app.patch("/api/quotes/:id/complete", authenticate, idempotencyMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const parsed = quoteCompletionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Datos inválidos", details: parsed.error.issues });
      }
      const { role, version } = parsed.data;

      const { thread, role: participantRole } = await getThreadParticipantRole(id, userId);
      if (!thread) return res.status(404).json({ success: false, error: "Solicitud no encontrada" });
      if (!participantRole) return res.status(403).json({ success: false, error: "No participás en esta solicitud" });

      const mappedRole = participantRole === "client" ? "REQUESTER" : "PROVIDER";
      if (mappedRole !== role) return res.status(403).json({ success: false, error: `Tu rol es ${mappedRole}, no ${role}` });
      if (thread.workflow_phase === "CLOSED") return res.status(400).json({ success: false, error: "Esta solicitud ya está cerrada" });

      try {
        await validateNotExpired(id);
      } catch (error: any) {
        if (error.message === 'TIMEOUT_ALREADY_RESOLVED') {
          return res.status(409).json({
            success: false,
            error: "La ventana de 72 horas expiró; la solicitud se cerrará automáticamente",
          });
        }
        throw error;
      }

      await prisma.$transaction(async (tx) => {
        const dbTimeResult = await tx.$queryRaw<Array<{ now: Date; deadline: Date }>>`
          SELECT NOW() as now, NOW() + INTERVAL '72 hours' as deadline
        `;
        const { now, deadline } = dbTimeResult[0];
        const updateData: any = { workflow_phase: "COMPLETION_PENDING", completionDeadline: deadline };

        if (role === "REQUESTER") updateData.confirmedByRequesterAt = now;
        else updateData.confirmedByProviderAt = now;

        const otherConfirmed =
          (role === "REQUESTER" && thread.confirmedByProviderAt) ||
          (role === "PROVIDER" && thread.confirmedByRequesterAt);

        if (otherConfirmed) {
          updateData.workflow_phase = "CLOSED";
          updateData.closure_outcome = "BILATERAL";
          updateData.completedAt = now;
        }

        updateData.status = otherConfirmed ? "COMPLETED" : "IN_CONVERSATION";

        if (!thread.completionInitiatorUserId) {
          updateData.completionInitiatorUserId = userId;
        }

        if (version !== undefined) {
          await updateThreadWithLocking(id, version, updateData, tx);
        } else {
          await tx.quoteThread.update({ where: { id }, data: updateData });
        }

        if (otherConfirmed) {
          const completionEvent = await emitRequestEvent(prisma, {
            requestId: id,
            eventType: 'COMPLETION_CONFIRMED',
            actorUserId: userId,
            completionCycleNo: thread.cycleNo || 0,
            metadata: { bilateralCompletion: true },
            tx,
          });

          await createReputationEvidence(prisma, {
            providerId: thread.providerId,
            requestId: id,
            evidenceType: 'BILATERAL_COMPLETION',
            evidenceWeight: 1.0,
            sourceEventId: completionEvent.id,
            tx,
          });

          log.info('Bilateral completion confirmed', { threadId: id, userId });
        } else {
          await emitRequestEvent(prisma, {
            requestId: id,
            eventType: 'COMPLETION_REQUESTED',
            actorUserId: userId,
            completionCycleNo: thread.cycleNo || 0,
            metadata: { actor: role === "REQUESTER" ? "requester" : "provider" },
            tx,
          });

          log.info('Completion requested', { threadId: id, userId, role });
        }
      });

      const message = thread.confirmedByRequesterAt || thread.confirmedByProviderAt
        ? "¡Trabajo confirmado! Ambas partes confirmaron el cierre."
        : "Confirmación registrada. Se activó ventana de 72h para que la otra parte confirme.";

      if (thread.confirmedByRequesterAt && thread.confirmedByProviderAt) {
        recalculateProviderTrustScore(thread.providerId)
          .catch((err) => log.error("[TrustScore] Recalc failed", { error: err }));
        
        analyzeProviderRisk(thread.providerId)
          .catch((err) => log.error("[RiskTelemetry] Analysis failed", { error: err }));
      }

      res.json({ success: true, message });
    } catch (error) {
      if (error instanceof ConcurrencyError) {
        return res.status(409).json({ success: false, error: error.message });
      }
      log.error("Complete quote error", { error });
      res.status(500).json({ success: false, error: "Error al confirmar cierre" });
    }
  });

  // Sprint 6.1.3: Endpoint para proveedor declinar solicitud (antes de interactuar)
  app.post("/api/quotes/:id/decline", authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const { reason } = req.body;

      const thread = await prisma.quoteThread.findUnique({
        where: { id },
        include: { 
          messages: true,
          provider: true
        }
      });

      if (!thread) {
        return res.status(404).json({ error: 'Solicitud no encontrada' });
      }

      // Validar que el usuario es el proveedor
      if (thread.provider.userId !== userId) {
        return res.status(403).json({ error: 'Solo el proveedor puede declinar esta solicitud' });
      }

      // Validar que NO haya interacción previa del proveedor
      const quotationHistory = thread.quotationHistory as any[] || [];
      const hasProviderInteraction = 
        thread.messages.some(m => m.authorId === userId) || 
        quotationHistory.length > 0;

      if (hasProviderInteraction) {
        return res.status(400).json({ 
          error: 'No se puede declinar tras interacción. Usá cancelación en su lugar.' 
        });
      }

      // Validar que no esté ya cerrado
      if (thread.workflow_phase === 'CLOSED') {
        return res.status(400).json({ error: 'Esta solicitud ya está cerrada' });
      }

      // Transacción atómica: cerrar thread + emitir evento
      await prisma.$transaction(async (tx) => {
        await tx.quoteThread.update({
          where: { id },
          data: {
            workflow_phase: 'CLOSED',
            closure_outcome: 'DECLINED_BY_PROVIDER'
          }
        });

        await emitRequestEvent(prisma, {
          requestId: id,
          eventType: 'REQUEST_DECLINED',
          actorUserId: userId,
          metadata: { reason: reason || 'No especificada' },
          tx
        });
      });

      log.info('Request declined by provider', { threadId: id, providerId: thread.providerId, reason });

      res.json({ 
        success: true, 
        message: 'Solicitud declinada exitosamente' 
      });
    } catch (error: any) {
      log.error('Error declining request', { error: error.message });
      res.status(500).json({ error: 'Error al declinar solicitud' });
    }
  });

  app.post("/api/quotes/:id/reject-completion", authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { note } = req.body;
      const { userId } = req.user;

      const thread = await prisma.quoteThread.findUnique({
        where: { id },
        select: { senderId: true, providerId: true }
      });

      if (!thread) {
        return res.status(404).json({ error: 'Thread no encontrado' });
      }

      const isParticipant = userId === thread.senderId || userId === thread.providerId;
      if (!isParticipant) {
        return res.status(403).json({ error: 'No sos parte de esta conversación' });
      }

      await rejectCompletion(id, userId, note);

      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'TIMEOUT_ALREADY_RESOLVED') {
        return res.status(409).json({
          error: 'La ventana de 72 horas expiró; la solicitud se cerrará automáticamente'
        });
      }
      if (error.message.includes('esperar') || error.message.includes('mensaje')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('no puede rechazar')) {
        return res.status(403).json({ error: error.message });
      }
      log.error('Error rejecting completion', { error: error.message });
      res.status(500).json({ error: 'Error al rechazar cierre' });
    }
  });

  app.post("/api/quotes/:id/withdraw-completion", authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const thread = await prisma.quoteThread.findUnique({
        where: { id },
        select: { senderId: true, providerId: true }
      });

      if (!thread) {
        return res.status(404).json({ error: 'Thread no encontrado' });
      }

      const isParticipant = userId === thread.senderId || userId === thread.providerId;
      if (!isParticipant) {
        return res.status(403).json({ error: 'No sos parte de esta conversación' });
      }

      await withdrawCompletion(id, userId);

      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'TIMEOUT_ALREADY_RESOLVED') {
        return res.status(409).json({
          error: 'La ventana de 72 horas expiró; la solicitud se cerrará automáticamente'
        });
      }
      if (error.message.includes('iniciador')) {
        return res.status(403).json({ error: error.message });
      }
      log.error('Error withdrawing completion', { error: error.message });
      res.status(500).json({ error: 'Error al retirar solicitud de cierre' });
    }
  });

  app.post("/api/quotes/:id/accept-quotation", authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const parsed = quoteAcceptanceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Datos inválidos", details: parsed.error.issues });
      }

      const { thread, role } = await getThreadParticipantRole(id, userId);
      if (!thread) return res.status(404).json({ success: false, error: "Solicitud no encontrada" });
      if (!role) return res.status(403).json({ success: false, error: "No participás en esta solicitud" });

      if (role !== "client") {
        return res.status(403).json({ success: false, error: "Solo el cliente puede aceptar la cotización" });
      }

      if (thread.acceptedQuotation) {
        return res.status(400).json({ success: false, error: "La cotización ya fue aceptada" });
      }

      if (!thread.quotedPriceLabel) {
        return res.status(400).json({ success: false, error: "No hay cotización para aceptar" });
      }

      const acceptedQuotation = {
        price: thread.quotedPriceLabel,
        delivery: thread.quotedDeliveryTime,
        acceptedAt: new Date().toISOString(),
        acceptedBy: userId,
      };

      await prisma.$transaction(async (tx) => {
        await tx.quoteThread.update({
          where: { id },
          data: { acceptedQuotation },
        });

        await emitRequestEvent(prisma, {
          requestId: id,
          eventType: 'QUOTE_ACCEPTED',
          actorUserId: userId,
          metadata: {
            price: thread.quotedPriceLabel,
            delivery: thread.quotedDeliveryTime,
          },
          tx,
        });

        log.info('Quote accepted event emitted', { threadId: id, userId });
      });

      const updated = await prisma.quoteThread.findUnique({
        where: { id },
        select: { acceptedQuotation: true },
      });

      res.json({ success: true, acceptedQuotation: updated?.acceptedQuotation });
    } catch (error) {
      log.error("Accept quotation error", { error });
      res.status(500).json({ success: false, error: "Error al aceptar cotización" });
    }
  });

  // ──────────────────────────────────────────────────────────
  // ADMIN REVIEWER / SUPER ADMIN MODERATION ROUTES
  // ──────────────────────────────────────────────────────────

  const riskReportInclude = {
    provider: {
      select: {
        id: true,
        displayName: true,
        slug: true,
        status: true,
        statusReason: true,
        suspendedUntil: true,
        city: true,
        category: true,
      },
    },
    reviewedBy: { select: { id: true, name: true, email: true } },
    escalatedBy: { select: { id: true, name: true, email: true } },
    resolvedBy: { select: { id: true, name: true, email: true } },
  } as const;

  app.get("/api/admin/risk-reports", authenticate, requireAdminReviewerOrSuperAdmin, async (req, res) => {
    try {
      const parsed = riskReportQuerySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Filtro de estado inválido", details: parsed.error.issues });
      const { status } = parsed.data;
      const reports = await prisma.riskReport.findMany({
        where: status ? { status } : undefined,
        include: riskReportInclude,
        orderBy: [{ status: "asc" }, { generatedAt: "desc" }],
      });
      res.json({ success: true, data: reports });
    } catch (error) {
      console.error("Admin reports error:", error);
      res.status(500).json({ success: false, error: "Error al obtener reportes" });
    }
  });

  app.get("/api/admin/risk-reports/:id", authenticate, requireAdminReviewerOrSuperAdmin, async (req, res) => {
    try {
      const report = await prisma.riskReport.findUnique({
        where: { id: req.params.id },
        include: riskReportInclude,
      });
      if (!report) return res.status(404).json({ success: false, error: "Reporte no encontrado" });
      res.json({ success: true, data: report });
    } catch (error) {
      console.error("Admin report detail error:", error);
      res.status(500).json({ success: false, error: "Error al obtener el reporte" });
    }
  });

  app.patch("/api/admin/risk-reports/:id/status", authenticate, requireAdminReviewerOrSuperAdmin, async (req, res) => {
    try {
      const parsed = riskReportStatusSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Estado de reporte inválido", details: parsed.error.issues });
      const { userId } = req.user;
      const { status, reviewerNotes, reason } = parsed.data;

      const roles = await getUserSystemRoles(userId);
      if (status === "ACTION_TAKEN" && !roles.has("SUPER_ADMIN")) {
        return res.status(403).json({ success: false, error: "Solo super administración puede resolver reportes con acción tomada" });
      }

      if ((status === "DISMISSED" || status === "ESCALATED" || status === "ACTION_TAKEN") && !(reason || reviewerNotes)?.trim()) {
        return res.status(400).json({ success: false, error: "Agregá una razón o nota para esta decisión" });
      }

      const updateData: Record<string, unknown> = {
        status,
        reviewerNotes: reviewerNotes?.trim() || reason?.trim() || null,
        reviewedAt: new Date(),
        reviewedByUserId: userId,
      };

      if (status === "ESCALATED") {
        updateData.escalatedAt = new Date();
        updateData.escalatedByUserId = userId;
      }

      if (status === "ACTION_TAKEN") {
        updateData.resolvedAt = new Date();
        updateData.resolvedByUserId = userId;
      }

      const report = await prisma.riskReport.update({
        where: { id: req.params.id },
        data: updateData,
        include: riskReportInclude,
      });

      await createModerationAuditLog({
        actorUserId: userId,
        action: `REPORT_${status}`,
        targetType: "RISK_REPORT",
        targetId: report.id,
        reason: reason?.trim() || reviewerNotes?.trim() || `Reporte marcado como ${status}`,
        metadata: { providerId: report.providerId, status },
      });

      res.json({ success: true, data: report });
    } catch (error) {
      console.error("Update risk report status error:", error);
      res.status(500).json({ success: false, error: "Error al actualizar el reporte" });
    }
  });

  app.post("/api/admin/risk-reports/:id/escalate", authenticate, requireAdminReviewerOrSuperAdmin, async (req, res) => {
    try {
      const parsed = riskReportEscalateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Agregá una nota para escalar el reporte", details: parsed.error.issues });
      const { userId } = req.user;
      const { reviewerNotes, reason } = parsed.data;
      const note = (reviewerNotes?.trim() || reason?.trim())!;

      const report = await prisma.riskReport.update({
        where: { id: req.params.id },
        data: {
          status: "ESCALATED",
          reviewerNotes: note,
          reviewedAt: new Date(),
          reviewedByUserId: userId,
          escalatedAt: new Date(),
          escalatedByUserId: userId,
        },
        include: riskReportInclude,
      });

      await createModerationAuditLog({
        actorUserId: userId,
        action: "REPORT_ESCALATED",
        targetType: "RISK_REPORT",
        targetId: report.id,
        reason: note,
        metadata: { providerId: report.providerId, status: "ESCALATED" },
      });

      res.json({ success: true, data: report });
    } catch (error) {
      console.error("Escalate risk report error:", error);
      res.status(500).json({ success: false, error: "Error al escalar el reporte" });
    }
  });

  async function updateProviderModerationStatus(
    providerId: string,
    actorUserId: string,
    status: ProviderStatus,
    reason: string,
    suspendedUntil?: string | null,
  ) {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { id: true, status: true, user: { select: { role: true } } },
    });

    if (!provider) throw new Error("PROVIDER_NOT_FOUND");
    if (!canTransition(provider.status, status)) {
      throw new Error(`INVALID_TRANSITION:${provider.status}:${status}`);
    }

    const usesSuspendedUntil = status === "SUSPENDED" || status === "TEMPORARILY_RESTRICTED";
    const updated = await prisma.provider.update({
      where: { id: providerId },
      data: {
        status,
        statusReason: status === "ACTIVE" ? null : reason,
        suspendedUntil: usesSuspendedUntil && suspendedUntil ? new Date(suspendedUntil) : null,
        statusUpdatedAt: new Date(),
        statusUpdatedById: actorUserId,
      },
    });

    const actionByStatus: Record<ProviderStatus, string> = {
      DRAFT: "PROVIDER_REVERTED_TO_DRAFT",
      ACTIVE: "PROVIDER_REACTIVATED",
      INACTIVE: "PROVIDER_INACTIVATED",
      TEMPORARILY_RESTRICTED: "PROVIDER_RESTRICTED",
      SUSPENDED: "PROVIDER_SUSPENDED",
      BANNED: "PROVIDER_BANNED",
    };

    await createModerationAuditLog({
      actorUserId,
      action: actionByStatus[status],
      targetType: "PROVIDER",
      targetId: providerId,
      reason: reason || (status === "ACTIVE" ? "Reactivación sin razón registrada" : "Cambio de estado"),
      metadata: { previousStatus: provider.status, nextStatus: status, suspendedUntil: suspendedUntil || null },
    });

    return updated;
  }

  app.post("/api/admin/providers/:providerId/suspend", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const parsed = providerSuspendSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Los datos de suspensión son inválidos", details: parsed.error.issues });
      const { userId } = req.user;
      const { reason, suspendedUntil } = parsed.data;
      const provider = await updateProviderModerationStatus(req.params.providerId, userId, "SUSPENDED", reason, suspendedUntil || null);
      res.json({ success: true, data: provider });
    } catch (error) {
      const msg = (error as Error).message;
      if (msg === "PROVIDER_NOT_FOUND") return res.status(404).json({ success: false, error: "Proveedor no encontrado" });
      if (msg.startsWith("INVALID_TRANSITION")) return res.status(409).json({ success: false, error: "No se puede suspender desde el estado actual del proveedor" });
      console.error("Suspend provider error:", error);
      res.status(500).json({ success: false, error: "Error al suspender proveedor" });
    }
  });

  app.post("/api/admin/providers/:providerId/ban", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const parsed = providerModerationReasonSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "El baneo requiere una razón", details: parsed.error.issues });
      const { userId } = req.user;
      const provider = await updateProviderModerationStatus(req.params.providerId, userId, "BANNED", parsed.data.reason);
      res.json({ success: true, data: provider });
    } catch (error) {
      const msg = (error as Error).message;
      if (msg === "PROVIDER_NOT_FOUND") return res.status(404).json({ success: false, error: "Proveedor no encontrado" });
      if (msg.startsWith("INVALID_TRANSITION")) return res.status(409).json({ success: false, error: "No se puede banear desde el estado actual del proveedor" });
      console.error("Ban provider error:", error);
      res.status(500).json({ success: false, error: "Error al banear proveedor" });
    }
  });

  app.post("/api/admin/providers/:providerId/reactivate", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const parsed = providerModerationReasonSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "La reactivación requiere una razón", details: parsed.error.issues });
      const { userId } = req.user;
      const provider = await updateProviderModerationStatus(req.params.providerId, userId, "ACTIVE", parsed.data.reason);
      res.json({ success: true, data: provider });
    } catch (error) {
      const msg = (error as Error).message;
      if (msg === "PROVIDER_NOT_FOUND") return res.status(404).json({ success: false, error: "Proveedor no encontrado" });
      if (msg.startsWith("INVALID_TRANSITION")) return res.status(409).json({ success: false, error: "No se puede reactivar desde el estado actual del proveedor" });
      console.error("Reactivate provider error:", error);
      res.status(500).json({ success: false, error: "Error al reactivar proveedor" });
    }
  });

  app.post("/api/admin/providers/:providerId/restrict", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const parsed = providerSuspendSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Los datos de restricción son inválidos", details: parsed.error.issues });
      const { userId } = req.user;
      const { reason, suspendedUntil } = parsed.data;
      const provider = await updateProviderModerationStatus(req.params.providerId, userId, "TEMPORARILY_RESTRICTED", reason, suspendedUntil || null);
      res.json({ success: true, data: provider });
    } catch (error) {
      const msg = (error as Error).message;
      if (msg === "PROVIDER_NOT_FOUND") return res.status(404).json({ success: false, error: "Proveedor no encontrado" });
      if (msg.startsWith("INVALID_TRANSITION")) return res.status(409).json({ success: false, error: "No se puede restringir desde el estado actual del proveedor" });
      console.error("Restrict provider error:", error);
      res.status(500).json({ success: false, error: "Error al restringir proveedor" });
    }
  });

  app.post("/api/admin/providers/:providerId/inactivate", authenticate, requireAdminReviewerOrSuperAdmin, async (req, res) => {
    try {
      const parsed = providerModerationReasonSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "La inactivación requiere una razón", details: parsed.error.issues });
      const { userId } = req.user;
      const provider = await updateProviderModerationStatus(req.params.providerId, userId, "INACTIVE", parsed.data.reason);
      res.json({ success: true, data: provider });
    } catch (error) {
      const msg = (error as Error).message;
      if (msg === "PROVIDER_NOT_FOUND") return res.status(404).json({ success: false, error: "Proveedor no encontrado" });
      if (msg.startsWith("INVALID_TRANSITION")) return res.status(409).json({ success: false, error: "No se puede inactivar desde el estado actual del proveedor" });
      console.error("Inactivate provider error:", error);
      res.status(500).json({ success: false, error: "Error al inactivar proveedor" });
    }
  });

  app.get("/api/admin/audit-log", authenticate, requireSuperAdmin, async (_req, res) => {
    try {
      const logs = await prisma.moderationAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { id: true, name: true, email: true } } },
      });
      res.json({ success: true, data: logs });
    } catch (error) {
      console.error("Audit log error:", error);
      res.status(500).json({ success: false, error: "Error al obtener auditoría" });
    }
  });

  app.get("/api/admin/threads/:id/events", authenticate, requireAdminReviewerOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const eventType = req.query.eventType as string | undefined;

      const thread = await prisma.quoteThread.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!thread) {
        return res.status(404).json({ success: false, error: "Thread no encontrado" });
      }

      const events = await prisma.requestEvent.findMany({
        where: {
          requestId: id,
          ...(eventType ? { eventType: eventType as any } : {}),
        },
        include: {
          actor: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { occurredAt: "asc" },
      });

      res.json({ success: true, data: events });
    } catch (error) {
      console.error("Admin thread events error:", error);
      res.status(500).json({ success: false, error: "Error al obtener eventos del thread" });
    }
  });

  app.post("/api/admin/resolve-expired-quotes", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const result = await resolveExpiredQuotes();
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST Generate AI Enhanced Bio
  app.post("/api/providers/enhance-bio", async (req, res) => {
    try {
      const parsed = enhanceBioSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Campos inválidos", details: parsed.error.issues });
      }
      const { bio, category } = parsed.data;

      const enhanced = await generateEnhancedBio(bio, category);
      res.json({ success: true, bio: enhanced });
    } catch (error) {
      res.status(500).json({ error: "No pudimos conectar con la Inteligencia Artificial para mejorar el texto. Inténtalo de nuevo más tarde." });
    }
  });

  // POST Create Provider Profile
  app.post("/api/providers", authenticate, async (req, res) => {
    try {
      const parsed = providerCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Los datos del proveedor son inválidos", details: parsed.error.issues });
      const { userId } = req.user;
      const input = parsed.data;
      const { displayName, category, aboutDescription } = input;

      const baseSlug = slugifyProviderName(displayName);
      let slug = baseSlug;
      let suffix = 2;
      while (await prisma.provider.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${baseSlug}-${suffix++}`;
      }

      const legacyCity = normalizeCity(input.city) || LegacyCity.MANAGUA;
      const cityRef = await ensureCityReference(legacyCity);
      const mainCategory = String(input.mainCategory || category).trim();
      const rootCategory = await ensureCategoryReference(category);
      const primaryCategory = await ensureCategoryReference(mainCategory, rootCategory.id);
      const responseTimeHrs = input.responseTimeHrs || 1;

      const provider = await prisma.provider.create({
        data: {
          userId,
          displayName,
          slug,
          shortDescription: input.shortDescription || null,
          aboutDescription,
          logoUrl: input.logoUrl || null,
          coverImageUrl: input.coverImageUrl || null,
          city: legacyCity,
          cityId: cityRef.id,
          department: cityRef.departmentId ? cityMetadata[legacyCity].department : null,
          serviceRadius: input.serviceRadius || null,
          category,
          mainCategory,
          categoryLinks: {
            create: [
              { categoryId: rootCategory.id, isPrimary: false },
              ...(primaryCategory.id !== rootCategory.id ? [{ categoryId: primaryCategory.id, isPrimary: true }] : []),
            ],
          },
          priceRange: input.priceRange || null,
          availability: normalizeAvailability(input.availability),
          formalizationStatus: normalizeFormalizationStatus(input.formalizationStatus),
          status: "DRAFT",
          responseTimeHrs,
          metrics: {
            create: {
              profileCompleteness: 55,
              responseTimeHrs,
              completedRequests: 0,
              requestsResponded: 0,
              trustScore: 30,
            },
          },
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { role: "PROVIDER" },
      });

      res.status(201).json({ success: true, data: provider });
    } catch (e) {
      console.error("Create provider error:", e);
      res.status(500).json({ success: false, error: "Error al crear proveedor" });
    }
  });

  // POST Publish (DRAFT -> ACTIVE) — owner only
  app.post("/api/providers/:id/publish", authenticate, async (req, res) => {
    try {
      const providerId = req.params.id;
      const { userId } = req.user;

      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: {
          id: true,
          userId: true,
          status: true,
          shortDescription: true,
          aboutDescription: true,
          category: true,
          catalogItems: { where: { availabilityStatus: "DISPONIBLE" }, select: { id: true }, take: 1 },
        },
      });

      if (!provider) return res.status(404).json({ success: false, error: "Proveedor no encontrado" });
      if (provider.userId !== userId) return res.status(403).json({ success: false, error: "Solo el dueño puede publicar este perfil" });
      if (provider.status !== "DRAFT") return res.status(409).json({ success: false, error: "Solo los perfiles en borrador pueden publicarse" });

      const missing: string[] = [];
      if (!provider.shortDescription || provider.shortDescription.trim().length < 10) missing.push("una descripción corta");
      if (!provider.aboutDescription || provider.aboutDescription.trim().length < 40) missing.push("una descripción detallada de al menos 40 caracteres");
      if (provider.catalogItems.length === 0) missing.push("al menos un catálogo activo");
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Falta para publicar: ${missing.join(", ")}.`,
        });
      }

      const updated = await prisma.provider.update({
        where: { id: providerId },
        data: { status: "ACTIVE", statusReason: null, suspendedUntil: null, statusUpdatedAt: new Date(), statusUpdatedById: userId },
      });

      await createModerationAuditLog({
        actorUserId: userId,
        action: "PROVIDER_PUBLISHED",
        targetType: "PROVIDER",
        targetId: providerId,
        reason: "Publicación del perfil por el dueño",
        metadata: { previousStatus: "DRAFT", nextStatus: "ACTIVE" },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Publish provider error:", error);
      res.status(500).json({ success: false, error: "Error al publicar proveedor" });
    }
  });

  // PUT Update Profile
  app.put("/api/providers/:id", authenticate, async (req, res) => {
    try {
      const providerId = req.params.id;
      const { userId } = req.user;

      // Verify the authenticated user owns this provider
      const existing = await prisma.provider.findUnique({
        where: { id: providerId },
        select: { userId: true, category: true, mainCategory: true },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: "Proveedor no encontrado" });
      }

      if (existing.userId !== userId) {
        return res.status(403).json({ success: false, error: "No tenés permiso para editar este proveedor" });
      }

      const allowedFields = [
        "displayName", "bio", "logoUrl", "coverImageUrl", "city",
        "department", "serviceRadius", "category", "mainCategory", "subcategories",
        "priceMin", "priceMax", "priceRange", "businessHours", "deliveryOptions",
        "availability", "formalizationStatus", "shortDescription", "aboutDescription", "lat", "lng",
      ];

      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }
      if (updateData.city) {
        updateData.city = normalizeCity(updateData.city);
        if (updateData.city) {
          const cityRef = await ensureCityReference(updateData.city);
          updateData.cityId = cityRef.id;
          updateData.department = cityMetadata[updateData.city as LegacyCity].department;
        }
      }
      if (updateData.availability) updateData.availability = normalizeAvailability(updateData.availability);
      if (updateData.formalizationStatus) updateData.formalizationStatus = normalizeFormalizationStatus(updateData.formalizationStatus);

      const categoryChanged = updateData.category !== undefined || updateData.mainCategory !== undefined;
      const nextCategory = String(updateData.category ?? existing.category).trim();
      const nextMainCategory = String(updateData.mainCategory ?? existing.mainCategory ?? nextCategory).trim();
      const rootCategory = categoryChanged ? await ensureCategoryReference(nextCategory) : null;
      const primaryCategory = categoryChanged ? await ensureCategoryReference(nextMainCategory, rootCategory!.id) : null;
      const categoryLinks = categoryChanged && rootCategory && primaryCategory ? {
        deleteMany: {},
        create: [
          { categoryId: rootCategory.id, isPrimary: false },
          ...(primaryCategory.id !== rootCategory.id ? [{ categoryId: primaryCategory.id, isPrimary: true }] : []),
        ],
      } : undefined;

      const updated = await prisma.provider.update({
        where: { id: providerId },
        data: {
          ...updateData,
          ...(categoryLinks ? { categoryLinks } : {}),
        },
      });

      res.json({ success: true, data: updated });
    } catch(e) {
      console.error("Update provider error:", e);
      res.status(500).json({ success: false, error: "Error al actualizar proveedor" });
    }
  });

  // GET Catalog Item by ID
  app.get("/api/catalog-items/:id", async (req, res) => {
    try {
      const item = await getCatalogItem(req.params.id);
      if (!item) {
        return res.status(404).json({ success: false, error: "Item no encontrado" });
      }

      // Visibility gate: items inherit their provider's visibility.
      if (!isPubliclyVisible(item.provider?.status)) {
        const accessToken = req.cookies?.access_token;
        const payload = accessToken ? verifyAccessToken(accessToken) : null;
        const callerUserId = payload?.userId;
        const callerRoles = callerUserId ? await getUserSystemRoles(callerUserId) : new Set<string>();
        const isOwner = callerUserId && item.provider?.userId === callerUserId;
        const isModerator = callerRoles.has("ADMIN") || callerRoles.has("ADMIN_REVIEWER") || callerRoles.has("SUPER_ADMIN");
        if (!isOwner && !isModerator) {
          return res.status(404).json({ success: false, error: "Este catálogo no está disponible públicamente" });
        }
        return res.json({ success: true, data: item, preview: true });
      }

      res.json({ success: true, data: item });
    } catch (e) {
      console.error("Get catalog item error:", e);
      res.status(500).json({ success: false, error: "Error al obtener item" });
    }
  });

  // POST Create Catalog Item
  app.post("/api/catalog-items", authenticate, async (req, res) => {
    try {
      const { userId } = req.user;
      const { providerId, title, itemType, category, subcategory, description, priceMin, priceMax, currency, priceUnit, city, availabilityStatus, deliveryAvailable, pickupAvailable, mainImageUrl } = req.body;

      if (!providerId || !title || !itemType || !category || !description) {
        return res.status(400).json({ success: false, error: "Faltan campos obligatorios" });
      }

      const provider = await prisma.provider.findUnique({
        where: { id: providerId },
        select: { userId: true },
      });
      if (!provider || provider.userId !== userId) {
        return res.status(403).json({ success: false, error: "No tenés permiso para agregar items a este proveedor" });
      }

      const legacyCity = normalizeCity(city) || LegacyCity.MANAGUA;
      const cityRef = await ensureCityReference(legacyCity);
      const rootCategory = await ensureCategoryReference(category);
      const primaryCategory = await ensureCategoryReference(subcategory || category, rootCategory.id);

      const item = await prisma.catalogItem.create({
        data: {
          providerId,
          title,
          itemType: itemType || "SERVICIO_ESPECIALIZADO",
          category,
          subcategory: subcategory || "",
          description,
          priceMin: priceMin ? Number(priceMin) : null,
          priceMax: priceMax ? Number(priceMax) : null,
          currency: currency || "NIO",
          priceUnit: priceUnit || null,
          city: legacyCity,
          cityId: cityRef.id,
          availabilityStatus: availabilityStatus || "DISPONIBLE",
          deliveryAvailable: deliveryAvailable || false,
          pickupAvailable: pickupAvailable || false,
          mainImageUrl: mainImageUrl || null,
          categoryLinks: {
            create: [
              ...(primaryCategory.id !== rootCategory.id
                ? [{ categoryId: primaryCategory.id, isPrimary: true }]
                : [{ categoryId: rootCategory.id, isPrimary: true }]),
            ],
          },
          metrics: {
            create: {
              viewCount: 0,
              inquiryCount: 0,
              requestCount: 0,
            },
          },
        },
      });

      res.status(201).json({ success: true, data: item });
    } catch (e) {
      console.error("Create catalog item error:", e);
      res.status(500).json({ success: false, error: "Error al crear item" });
    }
  });

  // PUT Update Catalog Item
  app.put("/api/catalog-items/:id", authenticate, async (req, res) => {
    try {
      const { userId } = req.user;
      const itemId = req.params.id;

      const existing = await prisma.catalogItem.findUnique({
        where: { id: itemId },
        include: { provider: { select: { userId: true } } },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: "Item no encontrado" });
      }

      if (existing.provider.userId !== userId) {
        return res.status(403).json({ success: false, error: "No tenés permiso para editar este item" });
      }

      const allowedFields = ["title", "itemType", "category", "subcategory", "description", "priceMin", "priceMax", "priceUnit", "city", "availabilityStatus", "deliveryAvailable", "pickupAvailable", "mainImageUrl"];
      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (["priceMin", "priceMax"].includes(field)) {
            updateData[field] = req.body[field] ? Number(req.body[field]) : null;
          } else {
            updateData[field] = req.body[field];
          }
        }
      }

      if (updateData.city) {
        const legacyCity = normalizeCity(updateData.city) || LegacyCity.MANAGUA;
        const cityRef = await ensureCityReference(legacyCity);
        updateData.city = legacyCity;
        updateData.cityId = cityRef.id;
      }

      const categoryChanged = updateData.category !== undefined || updateData.subcategory !== undefined;
      const nextCategory = String(updateData.category ?? existing.category).trim();
      const nextSubcategory = String(updateData.subcategory ?? existing.subcategory ?? nextCategory).trim();
      const rootCategory = categoryChanged ? await ensureCategoryReference(nextCategory) : null;
      const primaryCategory = categoryChanged ? await ensureCategoryReference(nextSubcategory, rootCategory!.id) : null;
      const categoryLinks = categoryChanged && rootCategory && primaryCategory ? {
        deleteMany: {},
        create: [
          ...(primaryCategory.id !== rootCategory.id
            ? [{ categoryId: primaryCategory.id, isPrimary: true }]
            : [{ categoryId: rootCategory.id, isPrimary: true }]),
        ],
      } : undefined;

      const updated = await prisma.catalogItem.update({
        where: { id: itemId },
        data: {
          ...updateData,
          ...(categoryLinks ? { categoryLinks } : {}),
        },
      });

      res.json({ success: true, data: updated });
    } catch (e) {
      console.error("Update catalog item error:", e);
      res.status(500).json({ success: false, error: "Error al actualizar item" });
    }
  });

  // DELETE Catalog Item
  app.delete("/api/catalog-items/:id", authenticate, async (req, res) => {
    try {
      const { userId } = req.user;
      const itemId = req.params.id;

      const existing = await prisma.catalogItem.findUnique({
        where: { id: itemId },
        include: { provider: { select: { userId: true } } },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: "Item no encontrado" });
      }

      if (existing.provider.userId !== userId) {
        return res.status(403).json({ success: false, error: "No tenés permiso para eliminar este item" });
      }

      await prisma.catalogItem.delete({ where: { id: itemId } });
      res.json({ success: true, message: "Item eliminado" });
    } catch (e) {
      console.error("Delete catalog item error:", e);
      res.status(500).json({ success: false, error: "Error al eliminar item" });
    }
  });

  // GET Formalization Checklist [DEPRECATED - D-17]
  app.get("/api/providers/:id/formalization", async (req, res) => {
    res.status(501).json({
      success: false,
      error: "FEATURE_NOT_IN_MVP",
      message: "Formalización legal no forma parte del MVP activo (Decisión D-17). Ver /formalization para roadmap futuro.",
      roadmap: "/formalization"
    });
  });

  // PUT Formalization Checklist [DEPRECATED - D-17]
  app.put("/api/providers/:id/formalization", authenticate, async (req, res) => {
    res.status(501).json({
      success: false,
      error: "FEATURE_NOT_IN_MVP",
      message: "Formalización legal no forma parte del MVP activo (Decisión D-17). Ver /formalization para roadmap futuro.",
      roadmap: "/formalization"
    });
  });

  // GET Reviews by Provider
  app.get("/api/providers/:id/reviews", async (req, res) => {
    try {
      const reviews = await prisma.review.findMany({
        where: { providerId: req.params.id },
        include: { reviewer: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "desc" },
      });
      res.json({ success: true, data: reviews });
    } catch (error) {
      console.error("Get reviews error:", error);
      res.status(500).json({ success: false, error: "Error al obtener reseñas" });
    }
  });

  // POST Create Review
  app.post("/api/reviews", authenticate, idempotencyMiddleware, async (req, res) => {
    try {
      const parsed = reviewCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Los datos de la reseña son inválidos", details: parsed.error.issues });
      const { providerId, requestId, qualityScore, responseTimeScore, fulfillmentScore, communicationScore, valueScore, comment } = parsed.data;
      const { userId } = req.user;

      const request = await prisma.quoteThread.findUnique({
        where: { id: requestId },
        include: { provider: { select: { id: true, userId: true } } },
      });

      if (!request || request.providerId !== providerId) {
        return res.status(404).json({ success: false, error: "Solicitud no encontrada para este proveedor" });
      }

      const eligibility = await checkReviewEligibility(requestId, userId);
      if (!eligibility.eligible) {
        const errorMessages: Record<string, string> = {
          THREAD_NOT_FOUND: "Solicitud no encontrada",
          ONLY_REQUESTER_CAN_REVIEW: "Solo el cliente puede reseñar",
          SELF_REVIEW_NOT_ALLOWED: "No podés reseñar tu propio perfil",
          THREAD_NOT_CLOSED: "La solicitud debe estar cerrada para reseñar",
          ALREADY_REVIEWED: "Ya reseñaste esta solicitud",
          OUTCOME_NOT_REVIEWABLE: "Este tipo de cierre no permite reseña",
          NO_ENGAGEMENT_BEFORE_CANCELLATION: "No hubo suficiente interacción para reseñar",
        };
        const reason = (eligibility as { reason: string }).reason;
        return res.status(409).json({
          success: false,
          error: errorMessages[reason] || "No podés reseñar esta solicitud",
        });
      }
      const reviewWeight = eligibility.weight;

      const generalScore = (qualityScore + (responseTimeScore ?? qualityScore) + (fulfillmentScore ?? qualityScore) + (communicationScore ?? qualityScore) + (valueScore ?? qualityScore)) / 5;

      const review = await prisma.review.create({
        data: {
          providerId,
          reviewerId: userId,
          requestId,
          qualityScore,
          responseTimeScore: responseTimeScore ?? qualityScore,
          fulfillmentScore: fulfillmentScore ?? qualityScore,
          communicationScore: communicationScore ?? qualityScore,
          valueScore: valueScore ?? qualityScore,
          generalScore,
          weight: reviewWeight,
          comment,
          analysis: {
            create: {
              sentimentScore: null,
              qualitySignals: { verifiedRequest: true, bilateralCompletion: true },
              moderationFlags: { suspicious: false },
              generalScore,
              algorithmVersion: "v1-route-basic",
            },
          },
        },
        include: { reviewer: { select: { id: true, name: true, image: true } }, analysis: true },
      });

      const evidenceType = reviewWeight === 1.0 ? 'UNILATERAL_REVIEW_QUALIFIED' : 'UNILATERAL_REVIEW_QUALIFIED';
      await createReputationEvidence(prisma, {
        providerId,
        requestId,
        evidenceType,
        evidenceWeight: reviewWeight,
      });

      const reviewStats = await prisma.review.aggregate({
        where: { providerId },
        _avg: { generalScore: true },
        _count: { id: true },
      });

      await prisma.providerMetrics.upsert({
        where: { providerId },
        update: {
          avgRating: reviewStats._avg.generalScore,
          totalVerifiedReviews: reviewStats._count.id,
        },
        create: {
          providerId,
          avgRating: reviewStats._avg.generalScore,
          totalVerifiedReviews: reviewStats._count.id,
        },
      });

      await recalculateProviderTrustScore(providerId);

      res.status(201).json({ success: true, data: review });
    } catch (error) {
      console.error("Create review error:", error);
      res.status(500).json({ success: false, error: "Error al crear reseña" });
    }
  });

  app.patch("/api/reviews/:id", authenticate, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;
      const parsed = reviewUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, error: "Los datos de la reseña son inválidos", details: parsed.error.issues });

      const review = await prisma.review.findUnique({ where: { id } });
      if (!review) return res.status(404).json({ success: false, error: "Reseña no encontrada" });

      if (review.reviewerId !== userId) {
        return res.status(403).json({ success: false, error: "Solo el autor puede editar esta reseña" });
      }

      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - review.createdAt.getTime() > SEVEN_DAYS_MS) {
        return res.status(400).json({ success: false, error: "La reseña solo puede editarse durante los primeros 7 días" });
      }

      await prisma.reviewHistory.create({
        data: {
          reviewId: review.id,
          qualityScore: review.qualityScore,
          responseTimeScore: review.responseTimeScore,
          fulfillmentScore: review.fulfillmentScore,
          communicationScore: review.communicationScore,
          valueScore: review.valueScore,
          generalScore: review.generalScore,
          comment: review.comment,
          editedByUserId: userId,
          editedAt: new Date(),
        },
      });

      const merged = {
        qualityScore: parsed.data.qualityScore ?? review.qualityScore,
        responseTimeScore: parsed.data.responseTimeScore ?? review.responseTimeScore,
        fulfillmentScore: parsed.data.fulfillmentScore ?? review.fulfillmentScore,
        communicationScore: parsed.data.communicationScore ?? review.communicationScore,
        valueScore: parsed.data.valueScore ?? review.valueScore,
        comment: parsed.data.comment ?? review.comment,
      };
      const generalScore = (merged.qualityScore + merged.responseTimeScore + merged.fulfillmentScore + merged.communicationScore + merged.valueScore) / 5;

      const updated = await prisma.review.update({
        where: { id: review.id },
        data: { ...merged, generalScore, editedAt: new Date() },
        include: { reviewer: { select: { id: true, name: true, image: true } }, analysis: true },
      });

      await recalculateProviderTrustScore(review.providerId);

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Update review error:", error);
      res.status(500).json({ success: false, error: "Error al editar reseña" });
    }
  });

  // === VITE MIDDLEWARE OR STATIC SERVING ===
  // Production is explicit. `npm run dev` must keep Vite/HMR active even when a
  // previous production build exists in dist.
  const distPath = path.join(process.cwd(), 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');
  const isProduction = process.env.NODE_ENV === 'production';

  let vite: ViteDevServer | null = null;
  if (!isProduction) {
    // Development mode via Vite middleware
    console.log("Setting up Vite dev server...");
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom", // we handle SPA fallback ourselves below
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode - serve static built assets
    app.use(express.static(distPath));
  }

  // SPA fallback: serve index.html for any non-API GET request that wasn't matched above.
  // Required for client-side routes like /buscar, /dashboard/*, /proveedor/:id.
  // NOTE: Express 4 (path-to-regexp 0.1.x) does NOT support '*all' wildcard syntax
  // (that is Express 5 only). The correct wildcard here is '*'.
  app.get('*', async (req, res, next) => {
    // Skip API routes entirely (they should have responded already, but be defensive)
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    try {
      if (vite) {
        // Dev: read source index.html and let Vite transform it (injects HMR client, etc.)
        const template = fs.readFileSync(
          path.resolve(process.cwd(), 'index.html'),
          'utf-8'
        );
        const html = await vite.transformIndexHtml(req.url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } else {
        // Prod: send the prebuilt index.html
        res.sendFile(distIndexHtml);
      }
    } catch (err) {
      next(err);
    }
  });

  // Start the actual express server on host 0.0.0.0
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Conecta Emprende AI Server running on http://0.0.0.0:${PORT}`);
  });

  if (process.env.NODE_ENV !== "test") {
    cron.schedule("*/10 * * * *", async () => {
      try { await resolveExpiredQuotes(); }
      catch (error) { console.error("[Cron] Error resolving expired quotes:", error); }
    });
    console.log("✓ Cron job: resolve expired quotes every 10 minutes");
  }
}

startServer();
