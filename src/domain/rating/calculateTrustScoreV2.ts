export type TrustScoreV2Input = {
  hasBio: boolean;
  hasLogo: boolean;
  hasLocation: boolean;
  hasHours: boolean;

  emailVerified: boolean;
  phoneVerified: boolean;

  requestsResponded: number;
  requestsIgnored: number;

  bilateralCompletionsByRequester: Map<string, number>;

  weightedReviews: Array<{ score: number; weight: number }>;

  uniqueRequesters: number;

  accountAgeDays: number;

  responseTimeHrs: number | null;

  suspiciousActivityPenalty: number;
};

export type TrustScoreV2Result = {
  public_score: number | null;
  internal_score: number;
  reason: string | null;
  breakdown: {
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
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function calculateTrustScoreV2(input: TrustScoreV2Input): TrustScoreV2Result {
  const profile =
    (input.hasBio ? 2 : 0) +
    (input.hasLogo ? 1 : 0) +
    (input.hasLocation ? 1 : 0) +
    (input.hasHours ? 1 : 0);

  const contact =
    (input.emailVerified ? 2 : 0) +
    (input.phoneVerified ? 3 : 0);

  const totalRequests = input.requestsResponded + input.requestsIgnored;
  const responseRate = totalRequests > 0 ? input.requestsResponded / totalRequests : 0;
  const response = Math.round(responseRate * 10);

  let weightedCompletions = 0;
  for (const count of input.bilateralCompletionsByRequester.values()) {
    if (count === 1) weightedCompletions += 1.0;
    else if (count === 2) weightedCompletions += 1.5;
    else weightedCompletions += 2.0;
  }
  const completion = Math.min(Math.round((weightedCompletions / 15) * 30), 30);

  const priorMean = 4.0;
  const priorWeight = 10;
  const sumWeightedRatings = input.weightedReviews.reduce(
    (sum, r) => sum + r.score * r.weight,
    0
  );
  const sumWeights = input.weightedReviews.reduce((sum, r) => sum + r.weight, 0);
  const bayesianAvg = (priorMean * priorWeight + sumWeightedRatings) / (priorWeight + sumWeights);
  const rating = Math.round((bayesianAvg / 5.0) * 25);

  const diversity =
    input.uniqueRequesters === 0 ? 0 :
    input.uniqueRequesters === 1 ? 0 :
    input.uniqueRequesters <= 3 ? 3 :
    input.uniqueRequesters <= 5 ? 6 :
    10;

  const maturity =
    input.accountAgeDays < 30 ? 0 :
    input.accountAgeDays < 90 ? 5 :
    10;

  const reliability =
    input.responseTimeHrs === null ? 0 :
    input.responseTimeHrs < 24 ? 5 :
    input.responseTimeHrs < 48 ? 3 :
    input.responseTimeHrs < 72 ? 1 :
    0;

  const penalty = Math.min(input.suspiciousActivityPenalty, 40);

  const internal_score = Math.round(clamp(
    profile + contact + response + completion + rating +
    diversity + maturity + reliability - penalty
  ));

  const totalBilateral = Array.from(input.bilateralCompletionsByRequester.values())
    .reduce((sum, c) => sum + c, 0);

  const public_score = totalBilateral >= 3 ? internal_score : null;
  const reason = totalBilateral < 3 ? 'INSUFFICIENT_EVIDENCE' : null;

  return {
    public_score,
    internal_score,
    reason,
    breakdown: {
      profile, contact, response, completion, rating,
      diversity, maturity, reliability, penalty
    }
  };
}