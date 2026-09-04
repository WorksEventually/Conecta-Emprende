import { prisma } from "./db";
import { calculateTrustScoreV2 } from "../domain/rating/calculateTrustScoreV2";
import { rebuildTrustScoreFromEvents } from "./reputation-events-service.js";

export async function recalculateProviderTrustScore(providerId: string): Promise<{
  public_score: number | null;
  internal_score: number;
}> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    include: {
      user: { select: { emailVerified: true, createdAt: true } },
      metrics: true,
    },
  });

  if (!provider) throw new Error(`Provider ${providerId} not found`);

  const eventData = await rebuildTrustScoreFromEvents(prisma, providerId);

  const evidence = await prisma.reputationEvent.findMany({
    where: {
      providerId,
      invalidatedAt: null,
      evidenceType: 'BILATERAL_COMPLETION',
    },
    include: {
      request: { select: { senderId: true } },
    },
  });

  const bilateralCompletionsByRequester = new Map<string, number>();
  evidence.forEach((ev) => {
    if (ev.request?.senderId) {
      bilateralCompletionsByRequester.set(
        ev.request.senderId,
        (bilateralCompletionsByRequester.get(ev.request.senderId) || 0) + 1
      );
    }
  });

  const uniqueRequesters = eventData.requesterDiversityScore;

  const reviews = await prisma.review.findMany({
    where: { providerId },
    select: { generalScore: true, weight: true },
  });

  const weightedReviews = reviews.map((r) => ({
    score: r.generalScore,
    weight: r.weight,
  }));

  const accountAgeDays = Math.floor(
    (Date.now() - provider.user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const result = calculateTrustScoreV2({
    hasBio: !!provider.bio,
    hasLogo: !!provider.logoUrl,
    hasLocation: !!(provider.lat && provider.lng),
    hasHours: !!provider.businessHours,
    emailVerified: !!provider.user.emailVerified,
    phoneVerified: provider.verified,
    requestsResponded: provider.metrics?.requestsResponded || 0,
    requestsIgnored: 0,
    bilateralCompletionsByRequester,
    weightedReviews,
    uniqueRequesters,
    accountAgeDays,
    responseTimeHrs: provider.responseTimeHrs,
    suspiciousActivityPenalty: provider.metrics?.suspiciousActivityPenalty || 0,
  });

  await prisma.providerMetrics.upsert({
    where: { providerId },
    update: {
      trustScore: result.internal_score,
      bilateralCompletions: evidence.length,
      uniqueRequesters,
      lastRecalculatedAt: new Date(),
      updatedAt: new Date(),
    },
    create: {
      providerId,
      trustScore: result.internal_score,
      bilateralCompletions: evidence.length,
      uniqueRequesters,
      lastRecalculatedAt: new Date(),
    },
  });

  await prisma.trustScoreSnapshot.create({
    data: {
      providerId,
      profileCompleteScore: result.breakdown.profile,
      contactVerifiedScore: result.breakdown.contact,
      requestsRespondedScore: result.breakdown.response,
      requestsCompletedScore: result.breakdown.completion,
      avgReviewScore: result.breakdown.rating,
      responseTimeScore: result.breakdown.reliability,
      accountAgeFactor: result.breakdown.maturity + result.breakdown.diversity,
      suspiciousActivityPenalty: result.breakdown.penalty,
      finalScore: result.internal_score,
      algorithmVersion: "v2-bayesian",
      calculatedAt: new Date(),
    },
  });

  return {
    public_score: result.public_score,
    internal_score: result.internal_score,
  };
}