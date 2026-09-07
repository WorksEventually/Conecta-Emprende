import { prisma } from "./db";
import {
  calculateTrustScoreV2,
  TRUST_SCORE_ALGORITHM_VERSION,
} from "../domain/rating/calculateTrustScoreV2";

export async function recalculateProviderTrustScore(providerId: string): Promise<{
  public_score: number | null;
  internal_score: number;
  evidence_level: string;
  algorithm_version: string;
}> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    include: {
      user: { select: { emailVerified: true, createdAt: true } },
      metrics: true,
    },
  });

  if (!provider) throw new Error(`Provider ${providerId} not found`);

  const evidence = await prisma.reputationEvent.findMany({
    where: {
      providerId,
      invalidatedAt: null,
      evidenceType: 'BILATERAL_COMPLETION',
      algorithmVersion: TRUST_SCORE_ALGORITHM_VERSION,
    },
    select: {
      createdAt: true,
      request: {
        select: {
          senderId: true,
          completedAt: true,
          sender: {
            select: {
              emailVerified: true,
              createdAt: true,
              isSynthetic: true,
              collusionConfirmed: true,
            },
          },
        },
      },
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

  const eligibleRequesterIds = new Set<string>();
  for (const event of evidence) {
    const request = event.request;
    if (
      request?.senderId &&
      request.senderId !== provider.userId &&
      request.sender.emailVerified &&
      !request.sender.isSynthetic &&
      !request.sender.collusionConfirmed &&
      request.completedAt &&
      request.completedAt.getTime() - request.sender.createdAt.getTime() >= 14 * 24 * 60 * 60 * 1000
    ) {
      eligibleRequesterIds.add(request.senderId);
    }
  }
  const uniqueRequesters = eligibleRequesterIds.size;

  const reviews = await prisma.review.findMany({
    where: { providerId },
    select: { generalScore: true, weight: true },
  });

  const weightedReviews = reviews.map((r) => ({
    score: r.generalScore,
    weight: r.weight,
  }));

  const providerAgeDays = Math.floor(
    (Date.now() - (provider.activatedAt ?? provider.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const latestBilateralCompletion = evidence.reduce<Date | null>((latest, event) => {
    const occurredAt = event.request?.completedAt ?? event.createdAt;
    return !latest || occurredAt > latest ? occurredAt : latest;
  }, null);
  const daysSinceLastBilateralCompletion = latestBilateralCompletion
    ? Math.floor((Date.now() - latestBilateralCompletion.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const confirmedPenaltyEvidence = await prisma.reputationEvent.aggregate({
    where: {
      providerId,
      invalidatedAt: null,
      algorithmVersion: TRUST_SCORE_ALGORITHM_VERSION,
      evidenceType: { in: ['PENALTY_SUSPICIOUS_ACTIVITY', 'PENALTY_POLICY_VIOLATION'] },
    },
    _sum: { evidenceWeight: true },
  });
  const confirmedRiskPenalty = confirmedPenaltyEvidence._sum.evidenceWeight ?? 0;
  const severeConfirmedManipulation = confirmedRiskPenalty >= 30;
  const moderateConfirmedManipulation = confirmedRiskPenalty > 0;
  const moderationCap = provider.status === 'BANNED'
    ? 0
    : severeConfirmedManipulation
      ? 40
      : moderateConfirmedManipulation
        ? 60
        : 100;
  const growthHold = await prisma.riskReport.count({
    where: {
      providerId,
      riskScore: { gte: 70 },
      status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] },
    },
  }).then((count) => count > 0);

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
    accountAgeDays: providerAgeDays,
    responseTimeHrs: provider.responseTimeHrs,
    suspiciousActivityPenalty: confirmedRiskPenalty,
    eligibleInboundRequests: (provider.metrics?.requestsResponded || 0) + (provider.metrics?.completedRequests || 0),
    respondedEligibleRequests: provider.metrics?.requestsResponded || 0,
    medianFirstResponseHours: provider.responseTimeHrs,
    eligibleUniqueRequesters: uniqueRequesters,
    providerAgeDays,
    eligibleEngagements: evidence.length,
    adverseProviderEvents: 0,
    confirmedRiskPenalty,
    daysSinceLastBilateralCompletion,
    moderationCap,
  });

  const publicScoreFrozen = provider.status === 'SUSPENDED';
  const publicTrustScore = publicScoreFrozen ? null : result.public_score;
  await prisma.providerMetrics.upsert({
    where: { providerId },
    update: {
      trustScore: result.internal_score,
      publicTrustScore,
      evidenceLevel: result.evidence_level,
      publicScoreFrozen,
      growthHold,
      algorithmVersion: TRUST_SCORE_ALGORITHM_VERSION,
      bilateralCompletions: evidence.length,
      uniqueRequesters,
      lastRecalculatedAt: new Date(),
      updatedAt: new Date(),
    },
    create: {
      providerId,
      trustScore: result.internal_score,
      publicTrustScore,
      evidenceLevel: result.evidence_level,
      publicScoreFrozen,
      growthHold,
      algorithmVersion: TRUST_SCORE_ALGORITHM_VERSION,
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
      publicScore: publicTrustScore,
      evidenceLevel: result.evidence_level,
      breakdown: result.breakdown,
      caps: result.caps,
      algorithmVersion: TRUST_SCORE_ALGORITHM_VERSION,
      calculatedAt: new Date(),
    },
  });

  return {
    public_score: result.public_score,
    internal_score: result.internal_score,
    evidence_level: result.evidence_level,
    algorithm_version: TRUST_SCORE_ALGORITHM_VERSION,
  };
}
