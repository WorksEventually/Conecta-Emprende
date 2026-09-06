/**
 * Admin Role/Status Permission Tests
 *
 * Smoke test para verificar la matriz de permisos de ADMIN_REVIEWER y SUPER_ADMIN
 * contra los endpoints reales del backend Express.
 *
 * Requisitos:
 *   1. PostgreSQL corriendo (DATABASE_URL en .env)
 *   2. npm run db:seed ejecutado (admin@ y superadmin@)
 *   3. npm run dev en otra terminal (server Express)
 *
 * Uso:
 *   npm run test:admin-permissions
 *   API_URL=http://localhost:3000 npx tsx scripts/test_admin_permissions.ts
 */
import assert from "node:assert/strict";
import { PrismaClient, LegacyCity, Availability } from "@prisma/client";

const BASE_URL = process.env.API_URL ?? "http://localhost:3000";
const SEED_PASSWORD = "Conecta123!";
const TEST_PREFIX = "test-admin-perm-";

const prisma = new PrismaClient();

// ─── HTTP helpers ───────────────────────────────────────────────────────────

interface ApiResponse {
  status: number;
  body: any;
}

async function login(email: string, password: string): Promise<{ cookie: string; userId: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(`Login failed for ${email}: ${data?.error ?? res.statusText}`);
  }
  const setCookies: string[] = res.headers.getSetCookie?.() ?? [];
  const accessToken = setCookies.find((c) => c.startsWith("access_token="));
  const refreshToken = setCookies.find((c) => c.startsWith("refresh_token="));
  if (!accessToken || !refreshToken) {
    throw new Error(`No auth cookies returned for ${email}`);
  }
  const cookieStr = `${accessToken.split(";")[0]}; ${refreshToken.split(";")[0]}`;
  return { cookie: cookieStr, userId: data.data?.user?.id };
}

async function apiRequest(
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
): Promise<ApiResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: parsed };
}

// ─── Test runner ────────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  fn: () => Promise<void>;
  skip?: boolean;
  skipReason?: string;
}

const suite: TestCase[] = [];

const test = (name: string, fn: () => Promise<void>): void => {
  suite.push({ name, fn });
};

const skip = (name: string, reason: string): void => {
  suite.push({ name, fn: async () => {}, skip: true, skipReason: reason });
};

// ─── Setup / teardown ────────────────────────────────────────────────────────

interface TestContext {
  adminCookie: string;
  superCookie: string;
  providerCookie: string;
  adminUserId: string;
  superUserId: string;
  providerUserId: string;
  testProviderId: string;
  reportForGetAndDismiss: string;
  reportForActionTakenNeg: string;
  reportForEscalate: string;
  reportForSuperActionTaken: string;
  reportForAuditEscalate: string;
}

async function buildContext(): Promise<TestContext> {
  console.log("\n-> Setup: login + test provider + test reports");
  const adminLogin = await login("admin@conecta.test", SEED_PASSWORD);
  const superLogin = await login("superadmin@conecta.test", SEED_PASSWORD);
  const provLogin = await login("textil@conecta.test", SEED_PASSWORD);

  // Crear provider de prueba en ACTIVE via Prisma
  const ts = Date.now();
  const slug = `${TEST_PREFIX}${ts}`;
  const testProvider = await prisma.provider.create({
    data: {
      userId: provLogin.userId,
      displayName: "TEST Admin Perm Provider",
      slug,
      city: LegacyCity.MANAGUA,
      category: "Marketing Digital",
      mainCategory: "Marketing Digital",
      aboutDescription: "Provider de prueba para test de permisos de admin.",
      shortDescription: "Test provider for admin permission tests",
      priceRange: "MEDIUM",
      availability: Availability.DISPONIBLE,
      status: "ACTIVE",
      verified: false,
      verificationLevel: "UNVERIFIED",
      completedRequests: 0,
      responseTimeHrs: 24,
    },
  });

  // Crear 5 RiskReport OPEN asociados al provider temporal para tests deterministas
  const createdReportIds: string[] = [];
  const now = new Date();
  for (let i = 0; i < 5; i++) {
    const r = await prisma.riskReport.create({
      data: {
        providerId: testProvider.id,
        riskScore: 50 + i,
        suspiciousCyclesCount: 1,
        status: "OPEN",
        recommendedAction: `Test risk report ${i + 1} for admin permission tests`,
        generatedAt: now,
      },
    });
    createdReportIds.push(r.id);
  }

  return {
    adminCookie: adminLogin.cookie,
    superCookie: superLogin.cookie,
    providerCookie: provLogin.cookie,
    adminUserId: adminLogin.userId,
    superUserId: superLogin.userId,
    providerUserId: provLogin.userId,
    testProviderId: testProvider.id,
    reportForGetAndDismiss:  createdReportIds[0],
    reportForActionTakenNeg: createdReportIds[1],
    reportForEscalate:       createdReportIds[2],
    reportForSuperActionTaken: createdReportIds[3],
    reportForAuditEscalate:  createdReportIds[4],
  };
}

async function cleanup(providerId: string): Promise<void> {
  console.log("\n-> Cleanup");
  await prisma.moderationActionApproval.deleteMany({ where: { targetType: "PROVIDER", targetId: providerId } });
  try {
    await prisma.riskReport.deleteMany({ where: { providerId } });
  } catch {
    console.warn("  Cleanup warning: could not delete test risk reports (cascade will handle)");
  }
  try {
    await prisma.provider.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  } catch {
    try {
      await prisma.provider.updateMany({
        where: { slug: { startsWith: TEST_PREFIX } },
        data: { status: "INACTIVE" },
      });
    } catch {
      console.warn("  Cleanup warning: could not delete or inactivate test providers");
    }
  }
  await prisma.$disconnect();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function runAll(ctx: TestContext): Promise<void> {
  const { adminCookie, superCookie, providerCookie, adminUserId, superUserId, providerUserId, testProviderId,
    reportForGetAndDismiss, reportForActionTakenNeg, reportForEscalate,
    reportForSuperActionTaken, reportForAuditEscalate } = ctx;
  const PROVIDER_ID = testProviderId;

  // ── ADMIN_REVIEWER: list / get / update / escalate ─────────────────────────

  test("ADMIN_REVIEWER list risk-reports -> 200", async () => {
    const r = await apiRequest("GET", "/api/admin/risk-reports", adminCookie);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body?.data));
  });

  test("ADMIN_REVIEWER get report detail -> 200", async () => {
    const r = await apiRequest("GET", `/api/admin/risk-reports/${reportForGetAndDismiss}`, adminCookie);
    assert.equal(r.status, 200);
    assert.equal(r.body?.data?.id, reportForGetAndDismiss);
  });

  test("ADMIN_REVIEWER dismiss report -> 200", async () => {
    const r = await apiRequest("PATCH", `/api/admin/risk-reports/${reportForGetAndDismiss}/status`, adminCookie, {
      status: "DISMISSED",
      reason: "Test dismiss by ADMIN_REVIEWER",
    });
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${r.body?.error}`);
  });

  test("ADMIN_REVIEWER cannot set ACTION_TAKEN -> 403", async () => {
    const r = await apiRequest("PATCH", `/api/admin/risk-reports/${reportForActionTakenNeg}/status`, adminCookie, {
      status: "ACTION_TAKEN",
      reason: "Test ACTION_TAKEN by ADMIN_REVIEWER (should be 403)",
    });
    assert.equal(r.status, 403, `Expected 403, got ${r.status}`);
  });

  test("ADMIN_REVIEWER escalate report -> 200", async () => {
    const r = await apiRequest("POST", `/api/admin/risk-reports/${reportForEscalate}/escalate`, adminCookie, {
      reviewerNotes: "Escalate test note",
    });
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${r.body?.error}`);
  });

  test("ADMIN_REVIEWER can inactivate provider -> 200", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/inactivate`, adminCookie, {
      reason: "Test inactivate by ADMIN_REVIEWER",
    });
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${r.body?.error}`);
    // Restore to ACTIVE for next tests
    await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/reactivate`, superCookie, {
      reason: "Cleanup post-inactivate",
    });
  });

  // ── ADMIN_REVIEWER: negatives ─────────────────────────────────────────────

  test("ADMIN_REVIEWER cannot suspend -> 403", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/suspend`, adminCookie, { reason: "x" });
    assert.equal(r.status, 403);
  });

  test("ADMIN_REVIEWER cannot ban -> 403", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/ban`, adminCookie, { reason: "x" });
    assert.equal(r.status, 403);
  });

  test("ADMIN_REVIEWER cannot reactivate -> 403", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/reactivate`, adminCookie, { reason: "x" });
    assert.equal(r.status, 403);
  });

  test("ADMIN_REVIEWER cannot restrict -> 403", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/restrict`, adminCookie, { reason: "x" });
    assert.equal(r.status, 403);
  });

  test("ADMIN_REVIEWER cannot access audit-log -> 403", async () => {
    const r = await apiRequest("GET", "/api/admin/audit-log", adminCookie);
    assert.equal(r.status, 403);
  });

  // ── PROVIDER: no es admin ───────────────────────────────────────────────────

  test("PROVIDER cannot list risk-reports -> 403", async () => {
    const r = await apiRequest("GET", "/api/admin/risk-reports", providerCookie);
    assert.equal(r.status, 403);
  });

  // ── SUPER_ADMIN: restrict / suspend / reactivate / ban ───────────────────────

  test("SUPER_ADMIN restrict with suspendedUntil -> 200", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/restrict`, superCookie, {
      reason: "Test restrict by SUPER_ADMIN",
      suspendedUntil: future,
    });
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${r.body?.error}`);
    // Restore
    await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/reactivate`, superCookie, {
      reason: "Cleanup post-restrict",
    });
  });

  test("ADMIN_REVIEWER requests suspension approval -> 202", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/moderation-approvals`, adminCookie, {
      action: "SUSPEND",
      reason: "Test suspend by SUPER_ADMIN",
    });
    assert.equal(r.status, 202, `Expected 202, got ${r.status}: ${r.body?.error}`);
    assert.ok(r.body?.data?.id, "Approval id should be returned");
    (ctx as any).suspensionApprovalId = r.body.data.id;
  });

  test("SUPER_ADMIN approves suspension -> 200", async () => {
    const approvalId = (ctx as any).suspensionApprovalId;
    const r = await apiRequest("POST", `/api/admin/moderation-approvals/${approvalId}/approve`, superCookie, {});
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${r.body?.error}`);
    const db = await prisma.provider.findUnique({ where: { id: PROVIDER_ID }, select: { status: true, statusReason: true } });
    assert.equal(db?.status, "SUSPENDED");
    assert.equal(db?.statusReason, "Test suspend by SUPER_ADMIN");
  });

  test("SUPER_ADMIN reactivate -> 200 (cleanup)", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/reactivate`, superCookie, {
      reason: "Cleanup reactivate",
    });
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${r.body?.error}`);
    const db = await prisma.provider.findUnique({ where: { id: PROVIDER_ID }, select: { status: true } });
    assert.equal(db?.status, "ACTIVE");
  });

  test("ADMIN_REVIEWER requests ban approval -> 202", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/moderation-approvals`, adminCookie, {
      action: "BAN",
      reason: "Test ban by SUPER_ADMIN (test provider)",
    });
    assert.equal(r.status, 202, `Expected 202, got ${r.status}: ${r.body?.error}`);
    (ctx as any).banApprovalId = r.body.data.id;
  });

  test("SUPER_ADMIN approves ban -> 200", async () => {
    const approvalId = (ctx as any).banApprovalId;
    const r = await apiRequest("POST", `/api/admin/moderation-approvals/${approvalId}/approve`, superCookie, {});
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${r.body?.error}`);
    const db = await prisma.provider.findUnique({ where: { id: PROVIDER_ID }, select: { status: true, statusReason: true } });
    assert.equal(db?.status, "BANNED");
    assert.equal(db?.statusReason, "Test ban by SUPER_ADMIN (test provider)");
    await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/reactivate`, superCookie, {
      reason: "Cleanup post-ban for deterministic Zod tests",
    });
  });

  test("Banned provider owner cannot create a replacement profile -> 403", async () => {
    const lineageSlug = `${TEST_PREFIX}lineage-${Date.now()}`;
    const lineageProvider = await prisma.provider.create({
      data: {
        userId: providerUserId,
        displayName: "TEST Banned Lineage",
        slug: lineageSlug,
        city: LegacyCity.MANAGUA,
        category: "Marketing Digital",
        mainCategory: "Marketing Digital",
        aboutDescription: "Provider baneado para validar la protección de linaje.",
        status: "BANNED",
      },
    });
    try {
      const r = await apiRequest("POST", "/api/providers", providerCookie, {
        displayName: "Replacement provider",
        category: "Marketing Digital",
        aboutDescription: "Perfil nuevo que no debe saltarse el linaje de riesgo.",
      });
      assert.equal(r.status, 403, `Expected 403, got ${r.status}: ${r.body?.error}`);
    } finally {
      await prisma.provider.delete({ where: { id: lineageProvider.id } });
    }
  });

  // ── SUPER_ADMIN: ACTION_TAKEN sí está permitido ─────────────────────────────

  test("SUPER_ADMIN can set ACTION_TAKEN -> 200", async () => {
    const r = await apiRequest("PATCH", `/api/admin/risk-reports/${reportForSuperActionTaken}/status`, superCookie, {
      status: "ACTION_TAKEN",
      reason: "Test ACTION_TAKEN by SUPER_ADMIN",
    });
    assert.equal(r.status, 200, `Expected 200, got ${r.status}: ${r.body?.error}`);
  });

  // ── Validaciones Zod y auth ────────────────────────────────────────────────

  test("SUPER_ADMIN suspend without reason -> 400", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/suspend`, superCookie, {});
    assert.equal(r.status, 400, `Expected 400, got ${r.status}`);
  });

  test("POST suspend without auth -> 401", async () => {
    const r = await apiRequest("POST", `/api/admin/providers/${PROVIDER_ID}/suspend`, undefined, {
      reason: "No auth",
    });
    assert.equal(r.status, 401, `Expected 401, got ${r.status}`);
  });

  // ── Audit logs (criterio 4) ────────────────────────────────────────────────

  test("Audit log entry for PROVIDER_SUSPENDED", async () => {
    const tempSlug = `${TEST_PREFIX}audit-${Date.now()}`;
    const temp = await prisma.provider.create({
      data: {
        userId: providerUserId,
        displayName: "TEST Audit Log",
        slug: tempSlug,
        city: LegacyCity.MANAGUA,
        category: "Marketing Digital",
        mainCategory: "Marketing Digital",
        aboutDescription: "Provider temporal para verificar audit log.",
        shortDescription: "Audit log test provider",
        priceRange: "MEDIUM",
        availability: Availability.DISPONIBLE,
        status: "ACTIVE",
        verified: false,
        verificationLevel: "UNVERIFIED",
        completedRequests: 0,
        responseTimeHrs: 24,
      },
    });
    try {
      const request = await apiRequest("POST", `/api/admin/providers/${temp.id}/moderation-approvals`, adminCookie, {
        action: "SUSPEND",
        reason: "Audit log verification test",
      });
      assert.equal(request.status, 202, "Approval request should succeed");
      const susp = await apiRequest("POST", `/api/admin/moderation-approvals/${request.body.data.id}/approve`, superCookie, {});
      assert.equal(susp.status, 200, "Approved suspend should succeed");
      const logRes = await apiRequest("GET", "/api/admin/audit-log", superCookie);
      assert.equal(logRes.status, 200, "Audit log GET should succeed");
      const logs: any[] = logRes.body?.data ?? [];
      const entry = logs.find(
       (l: any) => l.action === "PROVIDER_SUSPENDED_APPROVED" && l.targetId === temp.id && l.actorUserId === superUserId,
      );
      assert.ok(entry, "Should find approved suspension audit log entry for superUserId");
      assert.ok(entry.reason?.trim(), "Audit reason should be non-empty");
      assert.equal(entry.targetType, "PROVIDER");
    } finally {
      try {
        await prisma.provider.deleteMany({ where: { slug: tempSlug } });
      } catch {
        // ignore cleanup failure
      }
    }
  });

  test("Audit log entry for REPORT_ESCALATED", async () => {
    const escRes = await apiRequest("POST", `/api/admin/risk-reports/${reportForAuditEscalate}/escalate`, adminCookie, {
      reviewerNotes: "Audit log test escalate note",
    });
    assert.equal(escRes.status, 200, "Escalate should succeed");
    const logRes = await apiRequest("GET", "/api/admin/audit-log", superCookie);
    const logs: any[] = logRes.body?.data ?? [];
    const entry = logs.find(
      (l: any) => l.action === "REPORT_ESCALATED" && l.targetId === reportForAuditEscalate && l.actorUserId === adminUserId,
    );
    assert.ok(entry, "Should find REPORT_ESCALATED audit log entry for adminUserId");
    assert.equal(entry.targetType, "RISK_REPORT");
    assert.ok(entry.reason?.trim(), "Escalate reason should be non-empty");
  });

  // ─── Execute ────────────────────────────────────────────────────────────
  let passed = 0, failed = 0, skippedCount = 0;
  console.log("\n-> Running tests:\n");
  for (const tc of suite) {
    if (tc.skip) {
      skippedCount++;
      console.log(`O ${tc.name}  [skipped: ${tc.skipReason}]`);
      continue;
    }
    try {
      await tc.fn();
      passed++;
      console.log(`V ${tc.name}`);
    } catch (e) {
      failed++;
      console.error(`X ${tc.name}\n   ${(e as Error).message}`);
    }
  }
  console.log(`\n${failed === 0 ? "ADMIN_PERMISSION_TESTS_OK" : "ADMIN_PERMISSION_TESTS_FAILED"}  (${passed} passed, ${skippedCount} skipped, ${failed} failed)`);
  if (failed > 0) process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const ctx = await buildContext();
try {
  await runAll(ctx);
} finally {
  await cleanup(ctx.testProviderId);
}
