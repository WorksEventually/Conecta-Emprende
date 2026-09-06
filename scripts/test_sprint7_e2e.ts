import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.API_URL ?? "http://localhost:3000";
const PASSWORD = "Conecta123!";
const prisma = new PrismaClient();
const ids = {
  thread: "s7-http-feedback-thread",
  adminThread: "s7-http-admin-thread",
  beforeThread: "s7-http-edit-before",
  exactThread: "s7-http-edit-exact",
  afterThread: "s7-http-edit-after",
  requester: "seed_user_requester",
  provider: "seed_user_provider_textil",
  admin: "seed_user_admin",
};

async function api(method: string, path: string, cookie = "", body?: unknown) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  const cookies = (response.headers as any).getSetCookie?.() ?? [];
  return { status: response.status, payload, cookie: cookies.map((value: string) => value.split(";")[0]).join("; ") };
}

async function login(email: string) {
  const result = await api("POST", "/api/auth/login", "", { email, password: PASSWORD });
  assert.equal(result.status, 200);
  assert.ok(result.cookie);
  return result.cookie;
}

async function main() {
  const providerProfile = await prisma.provider.findFirstOrThrow({ where: { userId: ids.provider } });
  const createThread = (id: string, outcome: "BILATERAL" | "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE") => prisma.quoteThread.create({
    data: {
      id,
      senderId: ids.requester,
      providerId: providerProfile.id,
      subject: "Sprint 7 private feedback HTTP test",
      workflow_phase: "CLOSED",
      closure_outcome: outcome,
      completedAt: new Date(),
    },
  });
  await createThread(ids.thread, "BILATERAL");
  await createThread(ids.adminThread, "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE");
  await createThread(ids.beforeThread, "BILATERAL");
  await createThread(ids.exactThread, "BILATERAL");
  await createThread(ids.afterThread, "BILATERAL");

  const requesterCookie = await login("requester@conecta.test");
  const providerCookie = await login("textil@conecta.test");
  const adminCookie = await login("admin@conecta.test");

  const requesterPost = await api("POST", `/api/quotes/${ids.thread}/private-feedback`, requesterCookie, { note: "No debería pasar" });
  assert.equal(requesterPost.status, 403);

  const providerPost = await api("POST", `/api/quotes/${ids.thread}/private-feedback`, providerCookie, { note: "Cliente respetuoso y claro." });
  assert.equal(providerPost.status, 201);
  assert.ok(providerPost.payload?.data?.id);

  const providerGet = await api("GET", `/api/quotes/${ids.thread}/private-feedback`, providerCookie);
  assert.equal(providerGet.status, 200);
  assert.equal(providerGet.payload?.data?.note, "Cliente respetuoso y claro.");

  const requesterGet = await api("GET", `/api/quotes/${ids.thread}/private-feedback`, requesterCookie);
  assert.equal(requesterGet.status, 403);

  const eligibility = await api("GET", `/api/quotes/${ids.thread}/review-eligibility`, requesterCookie);
  assert.equal(eligibility.status, 200);
  assert.equal(eligibility.payload?.data?.eligible, true);
  assert.equal(eligibility.payload?.data?.weight, 1);

  const review = await api("POST", "/api/reviews", requesterCookie, {
    providerId: providerProfile.id,
    requestId: ids.thread,
    qualityScore: 5,
    responseTimeScore: 5,
    fulfillmentScore: 4,
    communicationScore: 5,
    valueScore: 4,
    comment: "Servicio claro y cumplido.",
  });
  assert.equal(review.status, 201);
  assert.ok(review.payload?.data?.id);
  assert.equal(review.payload?.data?.weight, 1);
  assert.ok(review.payload?.editableUntil);

  const duplicate = await api("POST", "/api/reviews", requesterCookie, {
    providerId: providerProfile.id,
    requestId: ids.thread,
    qualityScore: 5,
    comment: "Intento duplicado.",
  });
  assert.equal(duplicate.status, 409);

  const updated = await api("PATCH", `/api/reviews/${review.payload.data.id}`, requesterCookie, {
    qualityScore: 4,
    comment: "Servicio cumplido y actualizado.",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload?.data?.generalScore, 4.4);

  const evidence = await prisma.reputationEvent.findMany({ where: { requestId: ids.thread, evidenceType: "BILATERAL_COMPLETION" } });
  const history = await prisma.reviewHistory.findMany({ where: { reviewId: review.payload.data.id } });
  assert.equal(evidence.length, 1);
  assert.equal(history.length, 1);

  const adminReviewBody = {
    providerId: providerProfile.id,
    requestId: ids.adminThread,
    qualityScore: 5,
    responseTimeScore: 4,
    fulfillmentScore: 5,
    communicationScore: 5,
    valueScore: 4,
    comment: "Interacción comercial verificada.",
  };
  const unqualifiedReview = await api("POST", "/api/reviews", requesterCookie, adminReviewBody);
  assert.equal(unqualifiedReview.status, 409);

  const normalConfirmation = await api("POST", `/api/admin/threads/${ids.adminThread}/commercial-interaction`, requesterCookie, { note: "No autorizado" });
  assert.equal(normalConfirmation.status, 403);
  const emptyConfirmation = await api("POST", `/api/admin/threads/${ids.adminThread}/commercial-interaction`, adminCookie, { note: " " });
  assert.equal(emptyConfirmation.status, 400);
  const confirmation = await api("POST", `/api/admin/threads/${ids.adminThread}/commercial-interaction`, adminCookie, { note: "Se confirmó una interacción comercial significativa." });
  assert.equal(confirmation.status, 201);
  const audit = await prisma.moderationAuditLog.findFirst({ where: { action: "COMMERCIAL_INTERACTION_CONFIRMED", targetId: ids.adminThread } });
  assert.ok(audit);
  const reputationBeforeConfirmation = await prisma.reputationEvent.count({ where: { requestId: ids.adminThread } });
  assert.equal(reputationBeforeConfirmation, 0);
  const adminEligibility = await api("GET", `/api/quotes/${ids.adminThread}/review-eligibility`, requesterCookie);
  assert.equal(adminEligibility.status, 200);
  assert.equal(adminEligibility.payload?.data?.weight, 0.5);
  assert.equal(adminEligibility.payload?.data?.route, "UNILATERAL_QUALIFIED");
  const adminReview = await api("POST", "/api/reviews", requesterCookie, adminReviewBody);
  assert.equal(adminReview.status, 201);
  assert.equal(adminReview.payload?.data?.weight, 0.5);
  const unilateralEvidence = await prisma.reputationEvent.findMany({ where: { requestId: ids.adminThread, evidenceType: "UNILATERAL_REVIEW_QUALIFIED" } });
  assert.equal(unilateralEvidence.length, 1);
  assert.equal(unilateralEvidence[0]?.evidenceWeight, 0.5);

  const createTemporalReview = async (threadId: string) => {
    const result = await api("POST", "/api/reviews", requesterCookie, {
      providerId: providerProfile.id,
      requestId: threadId,
      qualityScore: 5,
      responseTimeScore: 5,
      fulfillmentScore: 5,
      communicationScore: 5,
      valueScore: 5,
      comment: "Reseña temporal.",
    });
    assert.equal(result.status, 201);
    return result.payload.data.id as string;
  };
  const beforeReviewId = await createTemporalReview(ids.beforeThread);
  const exactReviewId = await createTemporalReview(ids.exactThread);
  const afterReviewId = await createTemporalReview(ids.afterThread);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  await prisma.review.update({ where: { id: beforeReviewId }, data: { createdAt: new Date(Date.now() - sevenDays + 60_000) } });
  await prisma.review.update({ where: { id: exactReviewId }, data: { createdAt: new Date(Date.now() - sevenDays + 1_000) } });
  await prisma.review.update({ where: { id: afterReviewId }, data: { createdAt: new Date(Date.now() - sevenDays - 1_000) } });
  assert.equal((await api("PATCH", `/api/reviews/${beforeReviewId}`, requesterCookie, { comment: "Editada antes del límite." })).status, 200);
  assert.equal((await api("PATCH", `/api/reviews/${exactReviewId}`, requesterCookie, { comment: "Editada en el límite inclusivo." })).status, 200);
  assert.equal((await api("PATCH", `/api/reviews/${afterReviewId}`, requesterCookie, { comment: "No debería editarse." })).status, 400);
  const temporalHistory = await prisma.reviewHistory.count({ where: { reviewId: { in: [beforeReviewId, exactReviewId, afterReviewId] } } });
  assert.equal(temporalHistory, 2);
  const temporalEvidence = await prisma.reputationEvent.count({ where: { requestId: { in: [ids.beforeThread, ids.exactThread, ids.afterThread] }, evidenceType: "BILATERAL_COMPLETION" } });
  assert.equal(temporalEvidence, 3);

  console.log("✅ Sprint 7 HTTP E2E passed (27/27)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const threadIds = [ids.thread, ids.adminThread, ids.beforeThread, ids.exactThread, ids.afterThread];
    await prisma.moderationAuditLog.deleteMany({ where: { targetId: ids.adminThread } });
    await prisma.providerPrivateFeedback.deleteMany({ where: { requestId: ids.thread } });
    await prisma.reputationEvent.deleteMany({ where: { requestId: { in: threadIds } } });
    await prisma.reviewHistory.deleteMany({ where: { review: { requestId: { in: threadIds } } } });
    await prisma.reviewAnalysis.deleteMany({ where: { review: { requestId: { in: threadIds } } } });
    await prisma.review.deleteMany({ where: { requestId: { in: threadIds } } });
    await prisma.trustScoreSnapshot.deleteMany({ where: { providerId: providerProfileId() } });
    await prisma.quoteThread.deleteMany({ where: { id: { in: threadIds } } });
    await prisma.$disconnect();
  });

function providerProfileId() {
  return "seed_provider_textil";
}
