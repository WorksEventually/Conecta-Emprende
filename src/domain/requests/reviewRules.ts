import { prisma } from "../../lib/db";
import type { ProviderRequest, VerifiedReview } from "../../lib/identity";

export type ReviewValidationInput = {
  request: ProviderRequest | null;
  review: Pick<VerifiedReview, "reviewerUserId" | "reviewedProviderProfileId" | "requestId">;
  existingReviews: Pick<VerifiedReview, "requestId" | "reviewerUserId">[];
  reviewedProviderOwnerUserId: string;
};

// Legado: conservado para tests de validación sincrónica (test_profile_rating_admin.ts).
export function validateVerifiedReview(input: ReviewValidationInput): { valid: true } | { valid: false; reason: string } {
  const { request, review, existingReviews, reviewedProviderOwnerUserId } = input;
  if (!request) return { valid: false, reason: "REQUEST_NOT_FOUND" };
  if (request.id !== review.requestId) return { valid: false, reason: "REQUEST_MISMATCH" };
  if (request.status !== "COMPLETED") return { valid: false, reason: "REQUEST_NOT_COMPLETED" };
  if (!request.confirmedByRequesterAt || !request.confirmedByProviderAt) return { valid: false, reason: "BILATERAL_CONFIRMATION_REQUIRED" };
  if (request.targetProviderProfileId !== review.reviewedProviderProfileId) return { valid: false, reason: "WRONG_PROVIDER_PROFILE" };
  if (request.requesterUserId !== review.reviewerUserId) return { valid: false, reason: "REVIEWER_NOT_PARTICIPANT" };
  if (review.reviewerUserId === reviewedProviderOwnerUserId) return { valid: false, reason: "SELF_REVIEW_NOT_ALLOWED" };
  if (existingReviews.some((item) => item.requestId === review.requestId && item.reviewerUserId === review.reviewerUserId)) return { valid: false, reason: "DUPLICATE_REVIEW" };
  return { valid: true };
}

export type ReviewEligibilityResult =
  | { eligible: true; weight: number }
  | { eligible: false; reason: string };

export async function checkReviewEligibility(
  threadId: string,
  reviewerUserId: string
): Promise<ReviewEligibilityResult> {
  const thread = await prisma.quoteThread.findUnique({
    where: { id: threadId },
    include: { provider: { select: { userId: true } } },
  });

  if (!thread) {
    return { eligible: false, reason: "THREAD_NOT_FOUND" };
  }

  if (thread.senderId !== reviewerUserId) {
    return { eligible: false, reason: "ONLY_REQUESTER_CAN_REVIEW" };
  }

  if (thread.provider.userId === reviewerUserId) {
    return { eligible: false, reason: "SELF_REVIEW_NOT_ALLOWED" };
  }

  if (thread.workflow_phase !== "CLOSED") {
    return { eligible: false, reason: "THREAD_NOT_CLOSED" };
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
    return { eligible: false, reason: "ALREADY_REVIEWED" };
  }

  switch (thread.closure_outcome) {
    case "BILATERAL":
      return { eligible: true, weight: 1.0 };

    case "REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE":
      return { eligible: true, weight: 0.5 };

    case "CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT":
      return { eligible: true, weight: 0.5 };

    default:
      return { eligible: false, reason: "OUTCOME_NOT_REVIEWABLE" };
  }
}