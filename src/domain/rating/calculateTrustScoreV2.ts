export const TRUST_SCORE_ALGORITHM_VERSION = "trust-v2.0.0";
export const MINIMUM_BILATERAL_COMPLETIONS = 3;

export type TrustScoreEvidenceLevel = "INSUFFICIENT_EVIDENCE" | "OK";

export type TrustScoreV2Input = {
  hasBio: boolean;
  hasLogo: boolean;
  hasLocation: boolean;
  hasHours: boolean;

  emailVerified: boolean;
  phoneVerified: boolean;

  eligibleInboundRequests?: number;
  respondedEligibleRequests?: number;
  medianFirstResponseHours?: number | null;

  bilateralCompletionsByRequester: Map<string, number>;

  weightedReviews: Array<{ score: number; weight: number }>;

  eligibleUniqueRequesters?: number;
  providerAgeDays?: number;

  eligibleEngagements?: number;
  adverseProviderEvents?: number;
  confirmedRiskPenalty?: number;
  daysSinceLastBilateralCompletion?: number | null;
  moderationCap?: number;

  /** Compatibility alias for callers that still provide the old field. */
  requestsResponded?: number;
  /** Compatibility alias for callers that still provide the old field. */
  requestsIgnored?: number;
  /** Compatibility alias for callers that still provide account age. */
  accountAgeDays?: number;
  /** Compatibility alias for callers that still provide response time. */
  responseTimeHrs?: number | null;
  /** Compatibility alias for the old risk field. */
  suspiciousActivityPenalty?: number;
  /** Compatibility alias for the old diversity field. */
  uniqueRequesters?: number;
};

export type TrustScoreBreakdown = {
  profileCompleteness: number;
  contactConfirmation: number;
  responseBehavior: number;
  completionHistory: number;
  ratingQuality: number;
  requesterDiversity: number;
  providerMaturity: number;
  operationalReliability: number;
  confirmedRiskPenalty: number;
  profile: number;
  contact: number;
  response: number;
  completion: number;
  rating: number;
  diversity: number;
  maturity: number;
  reliability: number;
  penalty: number;
};

export type TrustScoreCaps = {
  completion: number;
  diversity: number;
  providerAge: number;
  reviewEvidence: number;
  confirmationRate: number;
  recency: number;
  moderation: number;
};

export type TrustScoreV2Result = {
  public_score: number | null;
  internal_score: number;
  evidence_level: TrustScoreEvidenceLevel;
  algorithm_version: string;
  reason: string | null;
  breakdown: TrustScoreBreakdown;
  caps: TrustScoreCaps;
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const nonNegative = (value: number | undefined) => Math.max(0, value ?? 0);

function responseTimePoints(hours: number | null): number {
  if (hours === null || !Number.isFinite(hours)) return 0;
  if (hours <= 1) return 4;
  if (hours <= 6) return 3;
  if (hours <= 24) return 2;
  if (hours <= 72) return 1;
  return 0;
}

function completionCap(completions: number): number {
  if (completions < 3) return 20;
  if (completions <= 7) return 35;
  if (completions <= 15) return 50;
  if (completions <= 30) return 65;
  if (completions <= 50) return 80;
  if (completions <= 99) return 90;
  return 100;
}

function diversityCap(requesters: number): number {
  if (requesters <= 2) return 25;
  if (requesters <= 7) return 45;
  if (requesters <= 14) return 65;
  if (requesters <= 24) return 80;
  if (requesters <= 49) return 90;
  return 100;
}

function providerAgeCap(days: number): number {
  if (days < 30) return 30;
  if (days < 90) return 45;
  if (days < 180) return 60;
  if (days < 365) return 75;
  if (days < 730) return 90;
  return 100;
}

function reviewEvidenceCap(weight: number): number {
  if (weight <= 0) return 70;
  if (weight < 5) return 75;
  if (weight < 15) return 85;
  if (weight < 30) return 90;
  if (weight < 60) return 95;
  return 100;
}

function recencyCap(days: number | null | undefined): number {
  if (days == null) return 65;
  if (days <= 90) return 100;
  if (days <= 180) return 95;
  if (days <= 365) return 90;
  if (days <= 730) return 80;
  return 65;
}

function calculateCompletionHistory(
  completionsByRequester: Map<string, number>
): { score: number; total: number } {
  let weightedCompletions = 0;
  let total = 0;

  for (const count of completionsByRequester.values()) {
    const completions = Math.max(0, Math.floor(count));
    total += completions;
    const contribution = completions === 0 ? 0 : completions === 1 ? 1 : completions === 2 ? 1.5 : 1.5 + (completions - 2) * 0.2;
    weightedCompletions += Math.min(contribution, 2);
  }

  return {
    score: 30 * Math.min(weightedCompletions / 50, 1),
    total,
  };
}

export function calculateTrustScoreV2(input: TrustScoreV2Input): TrustScoreV2Result {
  const eligibleInboundRequests = nonNegative(input.eligibleInboundRequests ?? input.requestsResponded);
  const respondedEligibleRequests = Math.min(
    eligibleInboundRequests,
    nonNegative(input.respondedEligibleRequests ?? input.requestsResponded)
  );
  const ignoredRequests = nonNegative(input.requestsIgnored);
  const denominator = eligibleInboundRequests || respondedEligibleRequests + ignoredRequests;
  const smoothedResponseRate =
    (respondedEligibleRequests + 4) / (denominator + 5);
  const responseBehavior = 6 * smoothedResponseRate + responseTimePoints(
    input.medianFirstResponseHours ?? input.responseTimeHrs ?? null
  );

  const completion = calculateCompletionHistory(input.bilateralCompletionsByRequester);
  const bilateralCompletions = completion.total;
  const weightedReviewCount = input.weightedReviews.reduce((sum, review) => sum + review.weight, 0);
  const weightedRatingTotal = input.weightedReviews.reduce(
    (sum, review) => sum + review.score * review.weight,
    0
  );
  const bayesianAverage = (4 * 10 + weightedRatingTotal) / (10 + weightedReviewCount);
  const ratingConfidence = Math.min(Math.sqrt(weightedReviewCount / 30), 1);

  const profileCompleteness =
    (input.hasBio ? 2 : 0) +
    (input.hasLogo ? 1 : 0) +
    (input.hasLocation ? 1 : 0) +
    (input.hasHours ? 1 : 0);
  const contactConfirmation = (input.emailVerified ? 2 : 0) + (input.phoneVerified ? 3 : 0);
  const completionHistory = completion.score;
  const ratingQuality = (bayesianAverage / 5) * 25 * ratingConfidence;
  const requesterDiversity = 10 * Math.min(nonNegative(input.eligibleUniqueRequesters ?? input.uniqueRequesters) / 25, 1);
  const providerAgeDays = nonNegative(input.providerAgeDays ?? input.accountAgeDays);
  const providerMaturity =
    providerAgeDays < 30 ? 0 :
    providerAgeDays < 90 ? 2 :
    providerAgeDays < 180 ? 4 :
    providerAgeDays < 365 ? 6 :
    providerAgeDays < 730 ? 8 : 10;
  const eligibleEngagements = nonNegative(input.eligibleEngagements);
  const adverseProviderEvents = nonNegative(input.adverseProviderEvents);
  const reliabilityRate = (eligibleEngagements - adverseProviderEvents + 4) / (eligibleEngagements + 5);
  const operationalReliability = 5 * clamp(reliabilityRate, 0, 1);
  const confirmedRiskPenalty = clamp(
    input.confirmedRiskPenalty ?? input.suspiciousActivityPenalty ?? 0,
    0,
    40
  );

  const breakdown: TrustScoreBreakdown = {
    profileCompleteness,
    contactConfirmation,
    responseBehavior,
    completionHistory,
    ratingQuality,
    requesterDiversity,
    providerMaturity,
    operationalReliability,
    confirmedRiskPenalty,
    profile: profileCompleteness,
    contact: contactConfirmation,
    response: responseBehavior,
    completion: completionHistory,
    rating: ratingQuality,
    diversity: requesterDiversity,
    maturity: providerMaturity,
    reliability: operationalReliability,
    penalty: confirmedRiskPenalty,
  };

  const rawTrustScore =
    profileCompleteness + contactConfirmation + responseBehavior + completionHistory +
    ratingQuality + requesterDiversity + providerMaturity + operationalReliability;
  const weightedEngagements = bilateralCompletions + adverseProviderEvents;
  const confirmationRate = weightedEngagements >= 10
    ? bilateralCompletions / Math.max(weightedEngagements, 1)
    : null;
  const confirmationRateCap = confirmationRate === null
    ? 100
    : confirmationRate < 0.4 ? 50
    : confirmationRate < 0.6 ? 65
    : confirmationRate < 0.7 ? 80
    : confirmationRate < 0.8 ? 90
    : 100;
  const caps: TrustScoreCaps = {
    completion: completionCap(bilateralCompletions),
    diversity: diversityCap(nonNegative(input.eligibleUniqueRequesters ?? input.uniqueRequesters)),
    providerAge: providerAgeCap(providerAgeDays),
    reviewEvidence: reviewEvidenceCap(weightedReviewCount),
    confirmationRate: confirmationRateCap,
    recency: recencyCap(input.daysSinceLastBilateralCompletion),
    moderation: clamp(input.moderationCap ?? 100),
  };
  const internal_score = Math.round(clamp(
    Math.min(
      Math.max(0, rawTrustScore - confirmedRiskPenalty),
      caps.completion,
      caps.diversity,
      caps.providerAge,
      caps.reviewEvidence,
      caps.confirmationRate,
      caps.recency,
      caps.moderation
    )
  ));
  const evidence_level: TrustScoreEvidenceLevel = bilateralCompletions >= MINIMUM_BILATERAL_COMPLETIONS
    ? "OK"
    : "INSUFFICIENT_EVIDENCE";

  return {
    public_score: evidence_level === "OK" ? internal_score : null,
    internal_score,
    evidence_level,
    algorithm_version: TRUST_SCORE_ALGORITHM_VERSION,
    reason: evidence_level === "OK" ? null : "INSUFFICIENT_EVIDENCE",
    breakdown,
    caps,
  };
}
