import { prisma } from "./db";
import type { RiskScoreInput } from "../domain/risk/calculateRiskScore";
import { calculateRiskScore } from "../domain/risk/calculateRiskScore";
import { recalculateProviderTrustScore } from "./trust-score-service";

export async function extractProviderMetrics(providerId: string): Promise<RiskScoreInput> {
  const threads = await prisma.quoteThread.findMany({
    where: { providerId },
    include: {
      messages: true,
      requestEvents: { select: { id: true, eventType: true } },
      sender: {
        select: {
          id: true,
          createdAt: true,
          isSynthetic: true,
          collusionConfirmed: true,
        },
      },
    },
  });

  const reviews = await prisma.review.findMany({
    where: { providerId },
    include: {
      reviewer: {
        select: {
          id: true,
          createdAt: true,
          isSynthetic: true,
          collusionConfirmed: true,
        },
      },
    },
  });

  const eligibleThreads = threads.filter((thread) =>
    !thread.sender?.isSynthetic && !thread.sender?.collusionConfirmed
  );
  const eligibleReviews = reviews.filter((review) =>
    !review.reviewer?.isSynthetic && !review.reviewer?.collusionConfirmed
  );

  if (eligibleThreads.length === 0) {
    // No activity yet: signals are unknown, not suspicious. Returning zeros
    // here made every new provider score as "ultra-fast completion + minimal
    // conversation".
    return {
      avgSearchTimeSeconds: null,
      avgRequestToCompletionMinutes: null,
      avgMessagesPerRequest: null,
      newAccountsPercentage: null,
      repeatedTargetProviderScore: null,
      ratingConcentrationScore: null,
      profileRecreationScore: await calculateProfileRecreation(providerId),
      synchronizedCompletionScore: null,
      reviewBurstScore: null,
      accountClusterScore: null,
      actionVolumeScore: null,
    };
  }

  const avgRequestToCompletionMinutes = calculateAvgCompletionTime(eligibleThreads);
  const avgMessagesPerRequest = calculateAvgMessages(eligibleThreads);
  const newAccountsPercentage = calculateNewAccountsPercentage(eligibleThreads);
  const repeatedTargetProviderScore = calculateRepeatedTargetScore(eligibleThreads);
  const ratingConcentrationScore = calculateRatingConcentration(eligibleReviews);
  const synchronizedCompletionScore = calculateSynchronizedCompletions(eligibleThreads);
  const reviewBurstScore = calculateReviewBurst(eligibleReviews);
  const accountClusterScore = calculateAccountCluster(eligibleThreads);
  const profileRecreationScore = await calculateProfileRecreation(providerId);
  const actionVolumeScore = calculateActionVolume(eligibleThreads, eligibleReviews);

  return {
    // Search telemetry does not exist yet (no SearchEvent model); report it
    // as unknown instead of an instant search (which added +20 to everyone).
    avgSearchTimeSeconds: null,
    avgRequestToCompletionMinutes,
    avgMessagesPerRequest,
    newAccountsPercentage,
    repeatedTargetProviderScore,
    ratingConcentrationScore,
    synchronizedCompletionScore,
    reviewBurstScore,
    accountClusterScore,
    profileRecreationScore,
    actionVolumeScore,
  };
}

function calculateAvgCompletionTime(threads: any[]): number {
  const bilateralThreads = threads.filter(
    (t) => t.closure_outcome === "BILATERAL" && t.completedAt
  );

  // Unknown until the provider has at least one bilateral completion;
  // 0 would be read as an ultra-fast completion (+20).
  if (bilateralThreads.length === 0) return null;

  const totalMinutes = bilateralThreads.reduce((sum, thread) => {
    const start = new Date(thread.createdAt).getTime();
    const end = new Date(thread.completedAt).getTime();
    const minutes = (end - start) / 1000 / 60;
    return sum + minutes;
  }, 0);

  return totalMinutes / bilateralThreads.length;
}

function calculateAvgMessages(threads: any[]): number {
  const threadsWithMessages = threads.filter((t) => t.messages.length > 0);

  // Unknown when no thread has messages; 0 would be read as minimal
  // conversation (+15).
  if (threadsWithMessages.length === 0) return null;

  const totalMessages = threadsWithMessages.reduce(
    (sum, thread) => sum + thread.messages.length,
    0
  );

  return totalMessages / threadsWithMessages.length;
}

function calculateNewAccountsPercentage(threads: any[]): number {
  if (threads.length === 0) return 0;

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const newAccounts = threads.filter((thread) => {
    if (!thread.sender?.createdAt) return false;
    const accountCreated = new Date(thread.sender.createdAt).getTime();
    return accountCreated > thirtyDaysAgo;
  });

  return (newAccounts.length / threads.length) * 100;
}

function calculateRepeatedTargetScore(threads: any[]): number {
  if (threads.length === 0) return 0;

  const requesterCounts = new Map<string, number>();

  threads.forEach((thread) => {
    const count = requesterCounts.get(thread.senderId) || 0;
    requesterCounts.set(thread.senderId, count + 1);
  });

  const maxRepeats = Math.max(...Array.from(requesterCounts.values()));
  const concentrationRatio = maxRepeats / threads.length;

  return Math.min(concentrationRatio * 100, 100);
}

function calculateRatingConcentration(reviews: any[]): number {
  // No reviews yet → no concentration evidence.
  if (reviews.length === 0) return null;

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const reviewsFromNewAccounts = reviews.filter((review) => {
    if (!review.reviewer?.createdAt) return false;
    const accountCreated = new Date(review.reviewer.createdAt).getTime();
    return accountCreated > thirtyDaysAgo;
  });

  const concentrationPercentage = (reviewsFromNewAccounts.length / reviews.length) * 100;

  return Math.min(concentrationPercentage, 100);
}

function calculateSynchronizedCompletions(threads: any[]): number | null {
  const completedAt = threads
    .filter((thread) => thread.closure_outcome === "BILATERAL" && thread.completedAt)
    .map((thread) => new Date(thread.completedAt).getTime())
    .sort((a, b) => a - b);

  if (completedAt.length < 2) return null;

  let synchronizedPairs = 0;
  for (let index = 1; index < completedAt.length; index += 1) {
    if (completedAt[index] - completedAt[index - 1] <= 60 * 1000) synchronizedPairs += 1;
  }

  return Math.min((synchronizedPairs / (completedAt.length - 1)) * 100, 100);
}

function calculateReviewBurst(reviews: any[]): number | null {
  if (reviews.length === 0) return null;

  const now = Date.now();
  const recentReviews = reviews.filter((review) => {
    const createdAt = new Date(review.createdAt).getTime();
    return now - createdAt <= 24 * 60 * 60 * 1000;
  });

  if (recentReviews.length < 2) return 0;
  return Math.min((recentReviews.length / 5) * 100, 100);
}

function calculateAccountCluster(threads: any[]): number | null {
  if (threads.length === 0) return null;

  const requesterGroups = new Map<string, { count: number; createdAt: number | null }>();
  for (const thread of threads) {
    if (!thread.senderId) continue;
    const current = requesterGroups.get(thread.senderId) ?? {
      count: 0,
      createdAt: thread.sender?.createdAt ? new Date(thread.sender.createdAt).getTime() : null,
    };
    current.count += 1;
    requesterGroups.set(thread.senderId, current);
  }

  if (requesterGroups.size < 2) return 0;

  const now = Date.now();
  const newAccountGroups = [...requesterGroups.values()].filter((group) =>
    group.createdAt !== null && now - group.createdAt <= 30 * 24 * 60 * 60 * 1000
  );
  const repeatedNewAccountGroups = newAccountGroups.filter((group) => group.count >= 2).length;
  return Math.min((repeatedNewAccountGroups / requesterGroups.size) * 100, 100);
}

function calculateActionVolume(threads: any[], reviews: any[]): number | null {
  const timestamps = [
    ...threads.map((thread) => new Date(thread.createdAt).getTime()),
    ...threads.flatMap((thread) => thread.messages
      .filter((message: any) => message.authorRole !== "system")
      .map((message: any) => new Date(message.createdAt).getTime())),
    ...reviews.map((review) => new Date(review.createdAt).getTime()),
  ].filter(Number.isFinite).sort((a, b) => a - b);

  if (timestamps.length === 0) return null;

  const now = Date.now();
  const recent = timestamps.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);
  if (recent.length <= 80) return 0;

  const intervals = recent.slice(1).map((timestamp, index) => timestamp - recent[index]);
  const mean = intervals.reduce((sum, value) => sum + value, 0) / Math.max(intervals.length, 1);
  const variance = intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(intervals.length, 1);
  const standardDeviation = Math.sqrt(variance);
  const regularityBonus = standardDeviation <= 1000 ? 25 : 0;
  return Math.min(50 + Math.min((recent.length - 80) / 80 * 25, 25) + regularityBonus, 100);
}

async function calculateProfileRecreation(providerId: string): Promise<number | null> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { riskLineageRootId: true },
  });
  if (!provider) return null;

  const rootId = provider.riskLineageRootId ?? providerId;
  const profiles = await prisma.provider.findMany({
    where: {
      OR: [
        { id: rootId },
        { riskLineageRootId: rootId },
      ],
    },
    select: { status: true },
  });
  if (profiles.length < 2) return 0;

  const bannedProfiles = profiles.filter((profile) => profile.status === "BANNED").length;
  return bannedProfiles > 0 ? Math.min((bannedProfiles / (profiles.length - 1)) * 100, 100) : 0;
}

export async function analyzeProviderRisk(providerId: string): Promise<void> {
  const metrics = await extractProviderMetrics(providerId);
  const threads = await prisma.quoteThread.findMany({
    where: { providerId },
    select: { requestEvents: { select: { id: true, eventType: true } } },
  });
  
  const riskResult = calculateRiskScore(metrics);
  const allRequestEventIds = threads.flatMap((thread) => thread.requestEvents.map((event) => event.id));
  const completionEventIds = threads.flatMap((thread) => thread.requestEvents
    .filter((event) => event.eventType === "COMPLETION_CONFIRMED")
    .map((event) => event.id));
  const messageEventIds = threads.flatMap((thread) => thread.requestEvents
    .filter((event) => event.eventType === "MESSAGE_SENT")
    .map((event) => event.id));
  const reviews = await prisma.review.findMany({
    where: { providerId },
    select: { id: true, reviewer: { select: { isSynthetic: true, collusionConfirmed: true } } },
  });
  const eligibleReviewIds = reviews
    .filter((review) => !review.reviewer.isSynthetic && !review.reviewer.collusionConfirmed)
    .map((review) => review.id);
  const sourceIds: Partial<Record<(typeof riskResult.signals)[number]["key"], string[]>> = {
    FAST_SEARCH: [],
    FAST_COMPLETION: completionEventIds,
    LOW_MESSAGE_COUNT: messageEventIds,
    NEW_ACCOUNT_CONCENTRATION: allRequestEventIds,
    REPEATED_PROVIDER_TARGET: allRequestEventIds,
    RATING_CONCENTRATION: [],
    SYNCHRONIZED_COMPLETIONS: completionEventIds,
    REVIEW_BURST: [],
    ACCOUNT_CLUSTER: allRequestEventIds,
    PROFILE_RECREATION: [],
    ACTION_VOLUME: allRequestEventIds,
  };
  
  if (!riskResult.shouldGenerateReport) {
    return;
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existingReport = await prisma.riskReport.findFirst({
    where: {
      providerId,
      status: "OPEN",
      generatedAt: {
        gte: twentyFourHoursAgo,
      },
    },
    orderBy: {
      generatedAt: "desc",
    },
  });

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const report = existingReport
      ? await tx.riskReport.update({
          where: { id: existingReport.id },
          data: {
            riskScore: riskResult.score,
            riskLevel: riskResult.level,
            penalty: riskResult.penalty,
            algorithmVersion: "risk-v1.0.0",
            avgSearchTimeSeconds: metrics.avgSearchTimeSeconds,
            avgRequestToCompletionMinutes: metrics.avgRequestToCompletionMinutes,
            avgMessagesPerRequest: metrics.avgMessagesPerRequest,
            newAccountsPercentage: metrics.newAccountsPercentage,
            ratingConcentrationScore: metrics.ratingConcentrationScore,
            recommendedAction: riskResult.recommendedAction,
          },
        })
      : await tx.riskReport.create({
          data: {
            providerId,
            riskScore: riskResult.score,
            riskLevel: riskResult.level,
            penalty: riskResult.penalty,
            algorithmVersion: "risk-v1.0.0",
            avgSearchTimeSeconds: metrics.avgSearchTimeSeconds,
            avgRequestToCompletionMinutes: metrics.avgRequestToCompletionMinutes,
            avgMessagesPerRequest: metrics.avgMessagesPerRequest,
            newAccountsPercentage: metrics.newAccountsPercentage,
            ratingConcentrationScore: metrics.ratingConcentrationScore,
            status: "OPEN",
            recommendedAction: riskResult.recommendedAction,
          },
        });

    await tx.riskSignalEvidence.createMany({
      data: riskResult.signals.map((signal) => ({
        providerId,
        riskReportId: report.id,
        signalKey: signal.key,
        observedValue: signal.observedValue,
        threshold: signal.threshold,
        contribution: signal.contribution,
        windowStart,
        windowEnd,
        sourceEventIds: sourceIds[signal.key] ?? [],
        sourceRecordIds: signal.key === "RATING_CONCENTRATION" || signal.key === "REVIEW_BURST"
          ? eligibleReviewIds
          : signal.key === "PROFILE_RECREATION"
            ? [providerId]
            : [],
        algorithmVersion: "risk-v1.0.0",
      })),
    });
  });

  // The report changes growth-hold state, so persist the derived Trust metrics
  // after the report and its immutable signal evidence exist.
  await recalculateProviderTrustScore(providerId);
}
