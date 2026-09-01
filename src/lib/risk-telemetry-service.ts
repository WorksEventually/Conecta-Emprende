import { prisma } from "./db";
import type { RiskScoreInput } from "../domain/risk/calculateRiskScore";
import { calculateRiskScore } from "../domain/risk/calculateRiskScore";

export async function extractProviderMetrics(providerId: string): Promise<RiskScoreInput> {
  const threads = await prisma.quoteThread.findMany({
    where: { providerId },
    include: {
      messages: true,
      sender: {
        select: {
          id: true,
          createdAt: true,
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
        },
      },
    },
  });

  if (threads.length === 0) {
    return {
      avgSearchTimeSeconds: 0,
      avgRequestToCompletionMinutes: 0,
      avgMessagesPerRequest: 0,
      newAccountsPercentage: 0,
      repeatedTargetProviderScore: 0,
      ratingConcentrationScore: 0,
    };
  }

  const avgRequestToCompletionMinutes = calculateAvgCompletionTime(threads);
  const avgMessagesPerRequest = calculateAvgMessages(threads);
  const newAccountsPercentage = calculateNewAccountsPercentage(threads);
  const repeatedTargetProviderScore = calculateRepeatedTargetScore(threads);
  const ratingConcentrationScore = calculateRatingConcentration(reviews);

  return {
    avgSearchTimeSeconds: 0,
    avgRequestToCompletionMinutes,
    avgMessagesPerRequest,
    newAccountsPercentage,
    repeatedTargetProviderScore,
    ratingConcentrationScore,
  };
}

function calculateAvgCompletionTime(threads: any[]): number {
  const bilateralThreads = threads.filter(
    (t) => t.closure_outcome === "BILATERAL" && t.completedAt
  );

  if (bilateralThreads.length === 0) return 0;

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

  if (threadsWithMessages.length === 0) return 0;

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
  if (reviews.length === 0) return 0;

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

export async function analyzeProviderRisk(providerId: string): Promise<void> {
  const metrics = await extractProviderMetrics(providerId);
  
  const riskResult = calculateRiskScore(metrics);
  
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

  if (existingReport) {
    await prisma.riskReport.update({
      where: { id: existingReport.id },
      data: {
        riskScore: riskResult.score,
        avgSearchTimeSeconds: metrics.avgSearchTimeSeconds,
        avgRequestToCompletionMinutes: metrics.avgRequestToCompletionMinutes,
        avgMessagesPerRequest: metrics.avgMessagesPerRequest,
        newAccountsPercentage: metrics.newAccountsPercentage,
        ratingConcentrationScore: metrics.ratingConcentrationScore,
        recommendedAction: riskResult.recommendedAction,
      },
    });
  } else {
    await prisma.riskReport.create({
      data: {
        providerId,
        riskScore: riskResult.score,
        avgSearchTimeSeconds: metrics.avgSearchTimeSeconds,
        avgRequestToCompletionMinutes: metrics.avgRequestToCompletionMinutes,
        avgMessagesPerRequest: metrics.avgMessagesPerRequest,
        newAccountsPercentage: metrics.newAccountsPercentage,
        ratingConcentrationScore: metrics.ratingConcentrationScore,
        status: "OPEN",
        recommendedAction: riskResult.recommendedAction,
      },
    });
  }
}
