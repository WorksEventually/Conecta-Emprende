import { prisma } from "./db";
import type { RiskScoreInput, RiskSignalKey } from "../domain/risk/calculateRiskScore";
import { calculateRiskScore } from "../domain/risk/calculateRiskScore";
import { recalculateProviderTrustScore } from "./trust-score-service";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

type TimeWindow = {
  start: Date;
  end: Date;
};

type RiskEvidenceSource = {
  window: TimeWindow;
  sourceEventIds: string[];
  sourceRecordIds: string[];
};

type ProviderRiskTelemetry = {
  metrics: RiskScoreInput;
  evidence: Record<RiskSignalKey, RiskEvidenceSource>;
};

type ProfileRecreationTelemetry = {
  score: number | null;
  sourceRecordIds: string[];
};

function createWindow(end: Date, durationMs: number): TimeWindow {
  return { start: new Date(end.getTime() - durationMs), end };
}

function isWithinWindow(value: Date | string | null | undefined, window: TimeWindow): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    && timestamp >= window.start.getTime()
    && timestamp <= window.end.getTime();
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function eventIdsFor(
  threads: any[],
  window: TimeWindow,
  eventType?: string,
): string[] {
  return uniqueIds(threads.flatMap((thread) => thread.requestEvents
    .filter((event: any) => (!eventType || event.eventType === eventType) && isWithinWindow(event.occurredAt, window))
    .map((event: any) => event.id)));
}

function evidenceSource(
  window: TimeWindow,
  sourceEventIds: string[] = [],
  sourceRecordIds: string[] = [],
): RiskEvidenceSource {
  return {
    window,
    sourceEventIds: uniqueIds(sourceEventIds),
    sourceRecordIds: uniqueIds(sourceRecordIds),
  };
}

async function collectProfileRecreationTelemetry(providerId: string): Promise<ProfileRecreationTelemetry> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { riskLineageRootId: true },
  });
  if (!provider) return { score: null, sourceRecordIds: [] };

  const rootId = provider.riskLineageRootId ?? providerId;
  const profiles = await prisma.provider.findMany({
    where: {
      OR: [
        { id: rootId },
        { riskLineageRootId: rootId },
      ],
    },
    select: { id: true, status: true },
  });

  if (profiles.length < 2) {
    return { score: 0, sourceRecordIds: profiles.map((profile) => profile.id) };
  }

  const bannedProfiles = profiles.filter((profile) => profile.status === "BANNED").length;
  return {
    score: bannedProfiles > 0 ? Math.min((bannedProfiles / (profiles.length - 1)) * 100, 100) : 0,
    sourceRecordIds: profiles.map((profile) => profile.id),
  };
}

async function collectProviderRiskTelemetry(providerId: string, windowEnd: Date): Promise<ProviderRiskTelemetry> {
  const thirtyDayWindow = createWindow(windowEnd, THIRTY_DAYS_MS);
  const twentyFourHourWindow = createWindow(windowEnd, TWENTY_FOUR_HOURS_MS);
  const oneHourWindow = createWindow(windowEnd, ONE_HOUR_MS);
  const historicalWindow: TimeWindow = { start: new Date(0), end: windowEnd };

  const [threads, reviews, profileRecreation] = await Promise.all([
    prisma.quoteThread.findMany({
      where: { providerId },
      include: {
        messages: { select: { id: true, createdAt: true, authorRole: true } },
        requestEvents: { select: { id: true, eventType: true, occurredAt: true } },
        sender: {
          select: {
            id: true,
            createdAt: true,
            isSynthetic: true,
            collusionConfirmed: true,
          },
        },
      },
    }),
    prisma.review.findMany({
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
    }),
    collectProfileRecreationTelemetry(providerId),
  ]);

  const eligibleThreads = threads.filter((thread) =>
    !thread.sender?.isSynthetic && !thread.sender?.collusionConfirmed,
  );
  const eligibleReviews = reviews.filter((review) =>
    !review.reviewer?.isSynthetic && !review.reviewer?.collusionConfirmed,
  );

  const recentThreads = eligibleThreads.filter((thread) => isWithinWindow(thread.createdAt, thirtyDayWindow));
  const recentlyCompletedThreads = eligibleThreads.filter((thread) =>
    thread.closure_outcome === "BILATERAL" && isWithinWindow(thread.completedAt, thirtyDayWindow),
  );
  const recentReviews = eligibleReviews.filter((review) => isWithinWindow(review.createdAt, thirtyDayWindow));
  const reviewsInLastDay = eligibleReviews.filter((review) => isWithinWindow(review.createdAt, twentyFourHourWindow));
  const hourlyThreads = eligibleThreads.filter((thread) =>
    isWithinWindow(thread.createdAt, oneHourWindow)
    || thread.messages.some((message: any) => isWithinWindow(message.createdAt, oneHourWindow)),
  );
  const hourlyReviews = eligibleReviews.filter((review) => isWithinWindow(review.createdAt, oneHourWindow));

  const metrics: RiskScoreInput = {
    // Search telemetry does not exist yet (no SearchEvent model); report it
    // as unknown instead of an instant search (which added +20 to everyone).
    avgSearchTimeSeconds: null,
    avgRequestToCompletionMinutes: calculateAvgCompletionTime(recentlyCompletedThreads),
    avgMessagesPerRequest: calculateAvgMessages(recentThreads),
    newAccountsPercentage: calculateNewAccountsPercentage(recentThreads, windowEnd),
    repeatedTargetProviderScore: calculateRepeatedTargetScore(recentThreads),
    ratingConcentrationScore: calculateRatingConcentration(recentReviews, windowEnd),
    synchronizedCompletionScore: calculateSynchronizedCompletions(recentlyCompletedThreads),
    reviewBurstScore: calculateReviewBurst(reviewsInLastDay, twentyFourHourWindow),
    accountClusterScore: calculateAccountCluster(recentThreads, windowEnd),
    profileRecreationScore: profileRecreation.score,
    actionVolumeScore: calculateActionVolume(eligibleThreads, eligibleReviews, oneHourWindow),
  };

  const recentThreadIds = recentThreads.map((thread) => thread.id);
  const completedThreadIds = recentlyCompletedThreads.map((thread) => thread.id);
  const recentReviewIds = recentReviews.map((review) => review.id);
  const reviewBurstIds = reviewsInLastDay.map((review) => review.id);
  const hourlyRecordIds = [
    ...hourlyThreads.map((thread) => thread.id),
    ...hourlyReviews.map((review) => review.id),
  ];

  return {
    metrics,
    evidence: {
      FAST_SEARCH: evidenceSource(thirtyDayWindow),
      FAST_COMPLETION: evidenceSource(
        thirtyDayWindow,
        eventIdsFor(recentlyCompletedThreads, thirtyDayWindow, "COMPLETION_CONFIRMED"),
        completedThreadIds,
      ),
      LOW_MESSAGE_COUNT: evidenceSource(
        thirtyDayWindow,
        eventIdsFor(recentThreads, thirtyDayWindow, "MESSAGE_SENT"),
        recentThreadIds,
      ),
      NEW_ACCOUNT_CONCENTRATION: evidenceSource(
        thirtyDayWindow,
        eventIdsFor(recentThreads, thirtyDayWindow),
        recentThreadIds,
      ),
      REPEATED_PROVIDER_TARGET: evidenceSource(
        thirtyDayWindow,
        eventIdsFor(recentThreads, thirtyDayWindow),
        recentThreadIds,
      ),
      RATING_CONCENTRATION: evidenceSource(thirtyDayWindow, [], recentReviewIds),
      SYNCHRONIZED_COMPLETIONS: evidenceSource(
        thirtyDayWindow,
        eventIdsFor(recentlyCompletedThreads, thirtyDayWindow, "COMPLETION_CONFIRMED"),
        completedThreadIds,
      ),
      REVIEW_BURST: evidenceSource(twentyFourHourWindow, [], reviewBurstIds),
      ACCOUNT_CLUSTER: evidenceSource(
        thirtyDayWindow,
        eventIdsFor(recentThreads, thirtyDayWindow),
        recentThreadIds,
      ),
      PROFILE_RECREATION: evidenceSource(historicalWindow, [], profileRecreation.sourceRecordIds),
      ACTION_VOLUME: evidenceSource(
        oneHourWindow,
        eventIdsFor(hourlyThreads, oneHourWindow),
        hourlyRecordIds,
      ),
    },
  };
}

export async function extractProviderMetrics(providerId: string): Promise<RiskScoreInput> {
  return (await collectProviderRiskTelemetry(providerId, new Date())).metrics;
}

function calculateAvgCompletionTime(threads: any[]): number | null {
  const bilateralThreads = threads.filter(
    (thread) => thread.closure_outcome === "BILATERAL" && thread.completedAt,
  );

  // Unknown until the provider has at least one bilateral completion;
  // 0 would be read as an ultra-fast completion (+20).
  if (bilateralThreads.length === 0) return null;

  const totalMinutes = bilateralThreads.reduce((sum, thread) => {
    const start = new Date(thread.createdAt).getTime();
    const end = new Date(thread.completedAt).getTime();
    return sum + (end - start) / 1000 / 60;
  }, 0);

  return totalMinutes / bilateralThreads.length;
}

function calculateAvgMessages(threads: any[]): number | null {
  const threadsWithMessages = threads.filter((thread) => thread.messages.length > 0);

  // Unknown when no thread has messages; 0 would be read as minimal
  // conversation (+15).
  if (threadsWithMessages.length === 0) return null;

  const totalMessages = threadsWithMessages.reduce(
    (sum, thread) => sum + thread.messages.length,
    0,
  );

  return totalMessages / threadsWithMessages.length;
}

function calculateNewAccountsPercentage(threads: any[], windowEnd: Date): number | null {
  if (threads.length === 0) return null;

  const thirtyDaysAgo = windowEnd.getTime() - THIRTY_DAYS_MS;
  const newAccounts = threads.filter((thread) => {
    if (!thread.sender?.createdAt) return false;
    const accountCreated = new Date(thread.sender.createdAt).getTime();
    return accountCreated >= thirtyDaysAgo && accountCreated <= windowEnd.getTime();
  });

  return (newAccounts.length / threads.length) * 100;
}

function calculateRepeatedTargetScore(threads: any[]): number | null {
  if (threads.length === 0) return null;

  const requesterCounts = new Map<string, number>();
  threads.forEach((thread) => {
    const count = requesterCounts.get(thread.senderId) || 0;
    requesterCounts.set(thread.senderId, count + 1);
  });

  const maxRepeats = Math.max(...Array.from(requesterCounts.values()));
  const concentrationRatio = maxRepeats / threads.length;
  return Math.min(concentrationRatio * 100, 100);
}

function calculateRatingConcentration(reviews: any[], windowEnd: Date): number | null {
  if (reviews.length === 0) return null;

  const thirtyDaysAgo = windowEnd.getTime() - THIRTY_DAYS_MS;
  const reviewsFromNewAccounts = reviews.filter((review) => {
    if (!review.reviewer?.createdAt) return false;
    const accountCreated = new Date(review.reviewer.createdAt).getTime();
    return accountCreated >= thirtyDaysAgo && accountCreated <= windowEnd.getTime();
  });

  return Math.min((reviewsFromNewAccounts.length / reviews.length) * 100, 100);
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

function calculateReviewBurst(reviews: any[], window: TimeWindow): number | null {
  const recentReviews = reviews.filter((review) => isWithinWindow(review.createdAt, window));
  if (recentReviews.length === 0) return null;
  if (recentReviews.length < 2) return 0;
  return Math.min((recentReviews.length / 5) * 100, 100);
}

function calculateAccountCluster(threads: any[], windowEnd: Date): number | null {
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

  const thirtyDaysAgo = windowEnd.getTime() - THIRTY_DAYS_MS;
  const newAccountGroups = [...requesterGroups.values()].filter((group) =>
    group.createdAt !== null && group.createdAt >= thirtyDaysAgo && group.createdAt <= windowEnd.getTime(),
  );
  const repeatedNewAccountGroups = newAccountGroups.filter((group) => group.count >= 2).length;
  return Math.min((repeatedNewAccountGroups / requesterGroups.size) * 100, 100);
}

function calculateActionVolume(threads: any[], reviews: any[], window: TimeWindow): number | null {
  const timestamps = [
    ...threads.map((thread) => new Date(thread.createdAt).getTime()),
    ...threads.flatMap((thread) => thread.messages
      .filter((message: any) => message.authorRole !== "system")
      .map((message: any) => new Date(message.createdAt).getTime())),
    ...reviews.map((review) => new Date(review.createdAt).getTime()),
  ].filter((timestamp) => Number.isFinite(timestamp)
    && timestamp >= window.start.getTime()
    && timestamp <= window.end.getTime())
    .sort((a, b) => a - b);

  if (timestamps.length === 0) return null;
  if (timestamps.length <= 80) return 0;

  const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]);
  const mean = intervals.reduce((sum, value) => sum + value, 0) / Math.max(intervals.length, 1);
  const variance = intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(intervals.length, 1);
  const standardDeviation = Math.sqrt(variance);
  const regularityBonus = standardDeviation <= 1000 ? 25 : 0;
  return Math.min(50 + Math.min((timestamps.length - 80) / 80 * 25, 25) + regularityBonus, 100);
}

export async function analyzeProviderRisk(providerId: string): Promise<void> {
  const windowEnd = new Date();
  const telemetry = await collectProviderRiskTelemetry(providerId, windowEnd);
  const riskResult = calculateRiskScore(telemetry.metrics);

  if (!riskResult.shouldGenerateReport) {
    return;
  }

  const twentyFourHoursAgo = new Date(windowEnd.getTime() - TWENTY_FOUR_HOURS_MS);
  const existingReport = await prisma.riskReport.findFirst({
    where: {
      providerId,
      status: "OPEN",
      generatedAt: { gte: twentyFourHoursAgo },
    },
    orderBy: { generatedAt: "desc" },
  });

  await prisma.$transaction(async (tx) => {
    const report = existingReport
      ? await tx.riskReport.update({
          where: { id: existingReport.id },
          data: {
            riskScore: riskResult.score,
            riskLevel: riskResult.level,
            penalty: riskResult.penalty,
            algorithmVersion: "risk-v1.0.0",
            avgSearchTimeSeconds: telemetry.metrics.avgSearchTimeSeconds,
            avgRequestToCompletionMinutes: telemetry.metrics.avgRequestToCompletionMinutes,
            avgMessagesPerRequest: telemetry.metrics.avgMessagesPerRequest,
            newAccountsPercentage: telemetry.metrics.newAccountsPercentage,
            ratingConcentrationScore: telemetry.metrics.ratingConcentrationScore,
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
            avgSearchTimeSeconds: telemetry.metrics.avgSearchTimeSeconds,
            avgRequestToCompletionMinutes: telemetry.metrics.avgRequestToCompletionMinutes,
            avgMessagesPerRequest: telemetry.metrics.avgMessagesPerRequest,
            newAccountsPercentage: telemetry.metrics.newAccountsPercentage,
            ratingConcentrationScore: telemetry.metrics.ratingConcentrationScore,
            status: "OPEN",
            recommendedAction: riskResult.recommendedAction,
          },
        });

    await tx.riskSignalEvidence.createMany({
      data: riskResult.signals.map((signal) => {
        const source = telemetry.evidence[signal.key];
        return {
          providerId,
          riskReportId: report.id,
          signalKey: signal.key,
          observedValue: signal.observedValue,
          threshold: signal.threshold,
          contribution: signal.contribution,
          windowStart: source.window.start,
          windowEnd: source.window.end,
          sourceEventIds: source.sourceEventIds,
          sourceRecordIds: source.sourceRecordIds,
          algorithmVersion: "risk-v1.0.0",
        };
      }),
    });
  });

  // The report changes growth-hold state, so persist the derived Trust metrics
  // after the report and its immutable signal evidence exist.
  await recalculateProviderTrustScore(providerId);
}
