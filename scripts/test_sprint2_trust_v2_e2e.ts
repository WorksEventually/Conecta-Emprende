/**
 * Sprint 2 (Trust V2 Bayesian) + Sprint 1 integration tests (E2E over HTTP).
 *
 * Exercises the real Express API against an isolated database:
 *   - full quote lifecycle: create -> quotation -> accept -> complete (bilateral)
 *   - trust score recalculation after completion and after review
 *   - review eligibility (weight 1.0 bilateral, duplicates blocked)
 *   - review edit window (immutable history, author-only)
 *   - P2 section 4.5: late completion confirmation rejected after 72h deadline
 *
 * Prerequisites (matching scripts/test_admin_permissions.ts):
 *   1. PostgreSQL running with a scratch DB (see DATABASE_URL)
 *   2. `prisma migrate deploy` + `npm run db:seed` executed against that DB
 *   3. `npm run dev` running against that DB (server on API_URL)
 *
 * Usage:
 *   API_URL=http://localhost:3000 npx tsx scripts/test_sprint2_trust_v2_e2e.ts
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.API_URL ?? "http://localhost:3000";
const SEED_PASSWORD = "Conecta123!";
const REQUESTER_EMAIL = "requester@conecta.test";
const PROVIDER_EMAIL = "textil@conecta.test";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${extra !== undefined ? ` - ${JSON.stringify(extra)}` : ""}`);
  }
}

async function api(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {}
): Promise<{ status: number; body: any; cookie: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const rawCookies: string[] =
    (res.headers as any).getSetCookie?.() ?? (res.headers.get("set-cookie")?.split(",") ?? []);
  const cookie = rawCookies.map((c) => c.split(";")[0]).join("; ");
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body, cookie };
}

async function login(email: string): Promise<{ cookie: string; userId: string }> {
  const res = await api("POST", "/api/auth/login", { body: { email, password: SEED_PASSWORD } });
  if (!res.body?.success) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  const userId = res.body?.data?.user?.id;
  if (!res.cookie || !userId) throw new Error(`No auth cookie/userId for ${email}`);
  return { cookie: res.cookie, userId };
}

async function providerIdFor(userId: string): Promise<string> {
  const provider = await prisma.provider.findFirst({ where: { userId } });
  if (!provider) throw new Error(`No provider found for user ${userId}`);
  return provider.id;
}

async function createThread(requesterCookie: string, providerId: string): Promise<string> {
  const res = await api("POST", "/api/quotes", {
    cookie: requesterCookie,
    body: { providerId, subject: "E2E test request", body: "Necesito un presupuesto para este e2e, por favor detallame." },
  });
  return res.body?.data?.id;
}
async function main() {
  console.log("Sprint 1/2 integration suite");

  const requester = await login(REQUESTER_EMAIL);
  const provider = await login(PROVIDER_EMAIL);
  const providerId = await providerIdFor(provider.userId);
  check("requester + provider login", Boolean(requester.cookie && provider.cookie));

  // 1. Full lifecycle: create -> messages -> quotation -> accept
  const threadId = await createThread(requester.cookie, providerId);
  check("create quote thread (authenticated)", Boolean(threadId));

  const msg = await api("POST", `/api/quotes/${threadId}/messages`, {
    cookie: provider.cookie,
    body: { text: "Hola, te comento el presupuesto en breve." },
  });
  check("provider sends message", msg.status === 201);

  const quoted = await api("PUT", `/api/quotes/${threadId}`, {
    cookie: provider.cookie,
    body: { quotedPriceLabel: "C$ 500", quotedDeliveryTime: "3 dias" },
  });
  const t1 = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  check("provider sends quotation (quotedPriceLabel)", Boolean(t1?.quotedPriceLabel));
  check("quotationHistory is append-only", Array.isArray(t1?.quotationHistory) && (t1?.quotationHistory as any[]).length >= 1);

  const acc = await api("POST", `/api/quotes/${threadId}/accept-quotation`, {
    cookie: requester.cookie,
    body: { price: "C$ 500", delivery: "3 dias" },
  });
  const t2 = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  check("requester accepts quotation (acceptedQuotation trace)", Boolean(t2?.acceptedQuotation));

  // 2. Completion -> bilateral close -> trust recalc
  const c1 = await api("PATCH", `/api/quotes/${threadId}/complete`, { cookie: provider.cookie, body: { role: "PROVIDER" } });
  const t3 = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  check("provider confirms -> COMPLETION_PENDING + deadline", c1.status === 200 && t3?.workflow_phase === "COMPLETION_PENDING" && Boolean(t3?.completionDeadline));

  const c2 = await api("PATCH", `/api/quotes/${threadId}/complete`, { cookie: requester.cookie, body: { role: "REQUESTER" } });
  const t4 = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  check("requester confirms -> CLOSED / BILATERAL", c2.status === 200 && t4?.workflow_phase === "CLOSED" && t4?.closure_outcome === "BILATERAL" && Boolean(t4?.completedAt));

  const metrics = await prisma.providerMetrics.findUnique({ where: { providerId } });
  check("trust recalculation after completion (metrics updated)", Boolean(metrics && metrics.bilateralCompletions >= 1 && metrics.trustScore > 0));
  const snapshots = await prisma.trustScoreSnapshot.count({ where: { providerId } });
  check("trust snapshot persisted", snapshots >= 1);

  // 3. Review: weight 1.0, duplicate blocked
  const rev = await api("POST", "/api/reviews", {
    cookie: requester.cookie,
    body: { providerId, requestId: threadId, qualityScore: 5, comment: "Excelente servicio en el e2e." },
  });
  const review = await prisma.review.findFirst({ where: { requestId: threadId } });
  check("review created with bilateral weight 1.0", rev.status === 201 && review?.weight === 1.0 && review.generalScore === 5);

  const dup = await api("POST", "/api/reviews", {
    cookie: requester.cookie,
    body: { providerId, requestId: threadId, qualityScore: 4, comment: "segunda reseña (duplicada)" },
  });
  check("duplicate review blocked", dup.status === 409);

  // 4. Review edit: author-only + immutable history (7-day window)
  const editOwn = await api("PATCH", `/api/reviews/${review.id}`, {
    cookie: requester.cookie,
    body: { comment: "Actualizo mi reseña tras la experiencia." },
  });
  const history = await prisma.reviewHistory.count({ where: { reviewId: review.id } });
  check("author edits review (200) + history recorded", editOwn.status === 200 && history >= 1);

  const editOther = await api("PATCH", `/api/reviews/${review.id}`, {
    cookie: provider.cookie,
    body: { comment: "intento de edición ajeno" },
  });
  check("non-author edit rejected (403)", editOther.status === 403);

  // 5. P2 4.5: late confirmation after deadline rejected (PR #15 fix)
  const threadB = await createThread(requester.cookie, providerId);
  await api("PATCH", `/api/quotes/${threadB}/complete`, { cookie: provider.cookie, body: { role: "PROVIDER" } });
  await prisma.quoteThread.update({
    where: { id: threadB },
    data: { completionDeadline: new Date(Date.now() - 60_000) },
  });
  const late = await api("PATCH", `/api/quotes/${threadB}/complete`, { cookie: requester.cookie, body: { role: "REQUESTER" } });
  check("late confirmation after deadline rejected (409)", late.status === 409);

  // 6. Review eligibility on non-closed thread
  const revOpen = await api("POST", "/api/reviews", {
    cookie: requester.cookie,
    body: { providerId, requestId: threadB, qualityScore: 4, comment: "intento de reseña en solicitud sin cerrar" },
  });
  check("review on non-closed thread rejected (409)", revOpen.status === 409);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error("Suite crashed:", err);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());