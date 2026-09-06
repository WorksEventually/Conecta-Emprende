import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { checkReviewEligibility, isReviewEditable, REVIEW_EDIT_WINDOW_MS } from "../src/domain/requests/reviewRules";

const ids = {
  requester: "s7-eligibility-requester",
  providerUser: "s7-eligibility-provider-user",
  provider: "s7-eligibility-provider",
  bilateral: "s7-eligibility-bilateral",
  unilateral: "s7-eligibility-unilateral",
  acceptedQuote: "s7-eligibility-accepted-quote",
  shortWindow: "s7-eligibility-short-window",
  exactWindow: "s7-eligibility-exact-window",
  longWindow: "s7-eligibility-long-window",
  noClosureTime: "s7-eligibility-no-closure-time",
  adminConfirmed: "s7-eligibility-admin-confirmed",
  providerCancelled: "s7-eligibility-provider-cancelled",
  claimedNoResponse: "s7-eligibility-claimed-no-response",
  expired: "s7-eligibility-expired",
  declined: "s7-eligibility-declined",
  requesterCancelled: "s7-eligibility-requester-cancelled",
  deactivated: "s7-eligibility-deactivated",
  open: "s7-eligibility-open",
  duplicate: "s7-eligibility-duplicate",
};

type Outcome =
  | "BILATERAL"
  | "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE"
  | "CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT"
  | "PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE"
  | "EXPIRED_NO_PROVIDER_RESPONSE"
  | "DECLINED_BY_PROVIDER"
  | "CANCELLED_BY_REQUESTER"
  | "ACCOUNT_DEACTIVATED";

async function main() {
  const boundaryNow = 10_000_000;
  assert.equal(isReviewEditable(new Date(boundaryNow - REVIEW_EDIT_WINDOW_MS), boundaryNow), true);
  assert.equal(isReviewEditable(new Date(boundaryNow - REVIEW_EDIT_WINDOW_MS - 1), boundaryNow), false);
  const now = Date.now();
  await prisma.user.createMany({
    data: [
      { id: ids.requester, email: "s7-requester@example.test", role: "USER" },
      { id: ids.providerUser, email: "s7-provider@example.test", role: "PROVIDER" },
    ],
    skipDuplicates: true,
  });
  await prisma.provider.upsert({
    where: { id: ids.provider },
    update: { userId: ids.providerUser },
    create: {
      id: ids.provider,
      userId: ids.providerUser,
      displayName: "Sprint 7 Provider",
      slug: "sprint-7-provider",
      city: "MANAGUA",
      category: "SERVICIOS",
      subcategories: [],
    },
  });

  const createThread = async (
    id: string,
    outcome: Outcome,
    options: { ageHours?: number; closed?: boolean; closureRecorded?: boolean; acceptedQuotation?: object } = {},
  ) => {
    const createdAt = new Date(now - (options.ageHours ?? 48) * 60 * 60 * 1000);
    return prisma.quoteThread.create({
      data: {
        id,
        senderId: ids.requester,
        providerId: ids.provider,
        subject: id,
        workflow_phase: options.closed === false ? "OPEN" : "CLOSED",
        closure_outcome: outcome,
        createdAt,
        completedAt: options.closed === false || options.closureRecorded === false ? null : new Date(now),
        acceptedQuotation: options.acceptedQuotation,
      },
    });
  };

  await createThread(ids.bilateral, "BILATERAL");
  await createThread(ids.unilateral, "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE");
  await createThread(ids.acceptedQuote, "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE", { ageHours: 2, acceptedQuotation: { price: 100 } });
  await createThread(ids.shortWindow, "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE", { ageHours: 23 + 59 / 60 + 59 / 3600 });
  await createThread(ids.exactWindow, "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE", { ageHours: 24 });
  await createThread(ids.longWindow, "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE", { ageHours: 48 });
  await createThread(ids.noClosureTime, "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE", { closureRecorded: false });
  await createThread(ids.adminConfirmed, "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE", { ageHours: 2 });
  await createThread(ids.providerCancelled, "CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT");
  await createThread(ids.claimedNoResponse, "PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE");
  await createThread(ids.expired, "EXPIRED_NO_PROVIDER_RESPONSE");
  await createThread(ids.declined, "DECLINED_BY_PROVIDER");
  await createThread(ids.requesterCancelled, "CANCELLED_BY_REQUESTER");
  await createThread(ids.deactivated, "ACCOUNT_DEACTIVATED");
  await createThread(ids.open, "BILATERAL", { closed: false });
  await createThread(ids.duplicate, "BILATERAL");

  await prisma.quoteMessage.createMany({
    data: [ids.unilateral, ids.exactWindow, ids.longWindow, ids.providerCancelled].map((threadId) => ({
      threadId,
      authorId: ids.providerUser,
      authorRole: "provider",
      body: "Cotización enviada al cliente.",
    })),
  });
  await prisma.moderationAuditLog.create({
    data: {
      actorUserId: ids.providerUser,
      action: "COMMERCIAL_INTERACTION_CONFIRMED",
      targetType: "QUOTE_THREAD",
      targetId: ids.adminConfirmed,
      reason: "Interacción comercial confirmada para pruebas",
    },
  });
  await prisma.review.create({
    data: {
      providerId: ids.provider,
      reviewerId: ids.requester,
      requestId: ids.duplicate,
      qualityScore: 5,
      responseTimeScore: 5,
      fulfillmentScore: 5,
      communicationScore: 5,
      valueScore: 5,
      generalScore: 5,
    },
  });

  const bilateral = await checkReviewEligibility(ids.bilateral, ids.requester);
  assert.equal(bilateral.eligible, true);
  if (bilateral.eligible) assert.deepEqual({ weight: bilateral.weight, route: bilateral.route }, { weight: 1, route: "BILATERAL" });

  for (const id of [ids.unilateral, ids.exactWindow, ids.longWindow, ids.acceptedQuote, ids.adminConfirmed, ids.providerCancelled]) {
    const result = await checkReviewEligibility(id, ids.requester);
    assert.equal(result.eligible, true, `${id} should be eligible`);
    if (result.eligible) assert.deepEqual({ weight: result.weight, route: result.route }, { weight: 0.5, route: "UNILATERAL_QUALIFIED" });
  }

  const shortWindow = await checkReviewEligibility(ids.shortWindow, ids.requester);
  assert.equal(shortWindow.eligible, false);
  if (!shortWindow.eligible) assert.equal(shortWindow.reason, "NO_ENGAGEMENT_BEFORE_CANCELLATION");
  assert.equal((await checkReviewEligibility(ids.noClosureTime, ids.requester)).reason, "CLOSURE_TIME_NOT_RECORDED");

  for (const id of [ids.claimedNoResponse, ids.expired, ids.declined, ids.requesterCancelled, ids.deactivated]) {
    const result = await checkReviewEligibility(id, ids.requester);
    assert.equal(result.eligible, false);
    if (!result.eligible) assert.equal(result.reason, "OUTCOME_NOT_REVIEWABLE");
  }
  assert.equal((await checkReviewEligibility(ids.open, ids.requester)).reason, "THREAD_NOT_CLOSED");
  assert.equal((await checkReviewEligibility(ids.duplicate, ids.requester)).reason, "ALREADY_REVIEWED");
  assert.equal((await checkReviewEligibility(ids.bilateral, ids.providerUser)).reason, "ONLY_REQUESTER_CAN_REVIEW");

  console.log("✅ Sprint 7 eligibility tests passed (20/20)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.review.deleteMany({ where: { requestId: { in: Object.values(ids) } } });
    await prisma.quoteMessage.deleteMany({ where: { threadId: { in: Object.values(ids) } } });
    await prisma.moderationAuditLog.deleteMany({ where: { targetId: ids.adminConfirmed } });
    await prisma.quoteThread.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.provider.deleteMany({ where: { id: ids.provider } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.requester, ids.providerUser] } } });
    await prisma.$disconnect();
  });
