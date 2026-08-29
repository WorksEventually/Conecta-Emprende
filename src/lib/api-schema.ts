import { z } from 'zod';

export const quoteDraftRequestSchema = z.object({
  idea: z.string().min(5, "La idea debe tener al menos 5 caracteres"),
  providerName: z.string().min(1, "El nombre del proveedor es obligatorio"),
});

export const quoteRequestSchema = z.object({
  providerId: z.string().min(1, "providerId es obligatorio"),
  subject: z.string().optional(),
  body: z.string().min(10, "El mensaje debe tener al menos 10 caracteres"),
  // Optional catalog item the request is about (spec §10.3 / §20.3):
  // "Si el usuario pregunta por un producto específico, la solicitud debe
  //  guardar el catalog_item_id".
  catalogItemId: z.string().optional(),
});

export const searchProviderSchema = z.object({
  // `q` may arrive as a string OR as an array of strings if the client accidentally
  // appends the param twice (e.g. ?q=userquery&q=category). Coerce to a single string.
  q: z.union([z.string(), z.array(z.string())]).optional()
    .transform(v => Array.isArray(v) ? v[0] : v),
  city: z.union([z.string(), z.array(z.string())]).optional()
    .transform(v => Array.isArray(v) ? v[0] : v),
});

export const aiSearchProviderSchema = z.object({
  query: z.string().min(2, "La consulta debe tener al menos 2 caracteres"),
});

export const formalizationUpdateSchema = z.object({
  providerId: z.string(),
  stepId: z.string(),
  status: z.enum(["completed", "current", "pending", "informal"]),
});

export const enhanceBioSchema = z.object({
  bio: z.string().min(10, "La biografía debe tener al menos 10 caracteres"),
  category: z.string()
});

// ──────────────────────────────────────────────────────────
// Auth Schemas
// ──────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
    .regex(/[0-9]/, "Debe contener al menos un número"),
});

export const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

const optionalTrimmedText = z.string().trim().optional();
const requiredReason = z.string().trim().min(1, "La razón es obligatoria").max(2000);
const reviewScore = z.number().min(0, "La puntuación mínima es 0").max(5, "La puntuación máxima es 5");

export const quoteMessageSchema = z.object({ text: z.string().trim().min(1, "El mensaje es obligatorio").max(10000) });

export const quoteUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_CONVERSATION", "COMPLETED", "CLOSED_REQUESTER", "CLOSED_PROVIDER", "CANCELLED"]).optional(),
  quotedPriceLabel: optionalTrimmedText,
  quotedDeliveryTime: optionalTrimmedText,
  confirmedByRequesterAt: z.union([z.boolean(), z.string().datetime()]).optional(),
  confirmedByProviderAt: z.union([z.boolean(), z.string().datetime()]).optional(),
});

export const quoteCompletionSchema = z.object({
  role: z.enum(["REQUESTER", "PROVIDER"]),
});

export const quoteAcceptanceSchema = z.object({
  price: z.string().trim().optional(),
  delivery: z.string().trim().optional(),
});

export const riskReportQuerySchema = z.object({
  status: z.enum(["OPEN", "UNDER_REVIEW", "DISMISSED", "ESCALATED", "ACTION_TAKEN"]).optional(),
});

export const riskReportStatusSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "DISMISSED", "ESCALATED", "ACTION_TAKEN"]),
  reviewerNotes: optionalTrimmedText,
  reason: optionalTrimmedText,
});

export const riskReportEscalateSchema = z.object({ reviewerNotes: optionalTrimmedText, reason: optionalTrimmedText })
  .refine((value) => Boolean(value.reviewerNotes || value.reason), { message: "Agregá una nota para escalar el reporte" });

export const providerSuspendSchema = z.object({
  reason: requiredReason,
  suspendedUntil: z.string().datetime({ message: "La fecha de suspensión no es válida" }).optional(),
});

export const providerModerationReasonSchema = z.object({ reason: requiredReason });

export const providerCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  mainCategory: optionalTrimmedText,
  shortDescription: optionalTrimmedText,
  aboutDescription: z.string().trim().min(40).max(5000),
  logoUrl: z.string().trim().url().or(z.literal("")).optional(),
  coverImageUrl: z.string().trim().url().or(z.literal("")).optional(),
  city: optionalTrimmedText,
  serviceRadius: optionalTrimmedText,
  priceRange: optionalTrimmedText,
  availability: z.enum(["DISPONIBLE", "OCUPADO", "BAJO_PEDIDO", "NO_DISPONIBLE_TEMPORALMENTE"]).optional(),
  formalizationStatus: z.enum(["INFORMAL", "EN_PROCESO", "MIPYME_FORMAL", "DOCUMENTOS_PENDIENTES"]).optional(),
  responseTimeHrs: z.coerce.number().int().min(1).max(8760).optional(),
});

export const reviewCreateSchema = z.object({
  providerId: z.string().min(1), requestId: z.string().min(1), qualityScore: reviewScore,
  responseTimeScore: reviewScore.optional(), fulfillmentScore: reviewScore.optional(),
  communicationScore: reviewScore.optional(), valueScore: reviewScore.optional(),
  comment: z.string().trim().max(5000).optional(),
});
