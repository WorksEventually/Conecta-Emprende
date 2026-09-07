import { prisma } from "../../lib/db";


export type ReviewEligibilityResult =
  | { eligible: true; weight: number; route: "BILATERAL" | "UNILATERAL_QUALIFIED"; reason: null; existingReview: null; editableUntil: null }
  | { eligible: false; reason: string; route: null; weight: null; existingReview: { id: string; createdAt: Date } | null; editableUntil: Date | null };

const UNILATERAL_OUTCOMES = new Set([
  "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE",
  "CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT",
]);

export const REVIEW_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isReviewEditable(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() <= REVIEW_EDIT_WINDOW_MS;
}

function ineligible(reason: string, existingReview: { id: string; createdAt: Date } | null = null): ReviewEligibilityResult {
  return {
    eligible: false,
    reason,
    route: null,
    weight: null,
    existingReview,
    editableUntil: existingReview ? new Date(existingReview.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
  };
}

export async function checkReviewEligibility(
  threadId: string,
  reviewerUserId: string
): Promise<ReviewEligibilityResult> {
  const thread = await prisma.quoteThread.findUnique({
    where: { id: threadId },
    include: { provider: { select: { userId: true } } },
  });

  if (!thread) {
    return ineligible("THREAD_NOT_FOUND");
  }

  if (thread.senderId !== reviewerUserId) {
    return ineligible("ONLY_REQUESTER_CAN_REVIEW");
  }

  if (thread.provider.userId === reviewerUserId) {
    return ineligible("SELF_REVIEW_NOT_ALLOWED");
  }

  if (thread.workflow_phase !== "CLOSED") {
    return ineligible("THREAD_NOT_CLOSED");
  }

  const existingReview = await prisma.review.findUnique({
    where: {
      requestId_providerId_reviewerId: {
        requestId: threadId,
        providerId: thread.providerId,
        reviewerId: reviewerUserId,
      },
    },
  });

  if (existingReview) {
    return ineligible("ALREADY_REVIEWED", existingReview);
  }

  if (thread.closure_outcome === "BILATERAL") {
    return { eligible: true, weight: 1.0, route: "BILATERAL", reason: null, existingReview: null, editableUntil: null };
  }

  if (!UNILATERAL_OUTCOMES.has(thread.closure_outcome || "")) {
    return ineligible("OUTCOME_NOT_REVIEWABLE");
  }

  const adminConfirmation = await prisma.moderationAuditLog.findFirst({
    where: { action: "COMMERCIAL_INTERACTION_CONFIRMED", targetType: "QUOTE_THREAD", targetId: threadId },
    select: { id: true },
  });
  const acceptedQuotation = thread.acceptedQuotation !== null;
  const closureEvent = await prisma.requestEvent.findFirst({
    where: {
      requestId: threadId,
      eventType: { in: ["COMPLETION_CONFIRMED", "COMPLETION_TIMEOUT", "CANCELLED_BY_PROVIDER"] },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  // A 24h window must be measured against the recorded closure event. The
  // message/creation fallbacks are intentionally not valid closure evidence.
  const closedAt = thread.completedAt ?? closureEvent?.occurredAt;
  if (!closedAt) {
    return ineligible("CLOSURE_TIME_NOT_RECORDED");
  }
  const activeFor24Hours = closedAt.getTime() - thread.createdAt.getTime() >= 24 * 60 * 60 * 1000;
  const providerSentNonSystemicMessage = await prisma.quoteMessage.findFirst({
    where: { threadId, authorId: thread.provider.userId, authorRole: { not: "system" } },
    select: { id: true },
  });

  if (!acceptedQuotation && !(providerSentNonSystemicMessage && activeFor24Hours) && !adminConfirmation) {
    return ineligible("NO_ENGAGEMENT_BEFORE_CANCELLATION");
  }

  return { eligible: true, weight: 0.5, route: "UNILATERAL_QUALIFIED", reason: null, existingReview: null, editableUntil: null };
}
