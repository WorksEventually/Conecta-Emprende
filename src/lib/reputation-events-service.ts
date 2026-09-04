import { PrismaClient, EvidenceType, Prisma } from '@prisma/client';
import { createLogger } from './logger.js';

const log = createLogger('ReputationEvents');

export interface CreateReputationEvidenceParams {
  providerId: string;
  requestId?: string;
  evidenceType: EvidenceType;
  evidenceWeight: number;
  sourceEventId?: string;
  algorithmVersion?: string;
  tx?: Prisma.TransactionClient;
}

export interface InvalidateEvidenceParams {
  evidenceId: string;
  invalidatedByAdminId: string;
  invalidationReason: string;
  tx?: Prisma.TransactionClient;
}

export interface EvidenceFilter {
  providerId?: string;
  requestId?: string;
  evidenceType?: EvidenceType;
  activeOnly?: boolean;
  fromDate?: Date;
  toDate?: Date;
}

export interface EvidenceWeightsSummary {
  totalWeight: number;
  byType: Record<EvidenceType, number>;
  count: number;
}

export async function createReputationEvidence(
  prisma: PrismaClient,
  params: CreateReputationEvidenceParams
): Promise<{ id: string; isNew: boolean }> {
  const {
    providerId,
    requestId,
    evidenceType,
    evidenceWeight,
    sourceEventId,
    algorithmVersion = 'trust-v2.0.0',
    tx,
  } = params;

  const client = tx || prisma;

  const uniqueConstraint = requestId ? { requestId, evidenceType } : undefined;

  if (uniqueConstraint) {
    const existing = await client.reputationEvent.findUnique({
      where: {
        requestId_evidenceType: uniqueConstraint,
      },
    });

    if (existing) {
      log.info('Reputation evidence already exists (idempotent)', {
        evidenceId: existing.id,
        providerId,
        requestId,
        evidenceType,
      });

      return { id: existing.id, isNew: false };
    }
  }

  const evidence = await client.reputationEvent.create({
    data: {
      providerId,
      requestId,
      evidenceType,
      evidenceWeight,
      sourceEventId,
      algorithmVersion,
    },
  });

  log.info('Reputation evidence created', {
    evidenceId: evidence.id,
    providerId,
    requestId,
    evidenceType,
    evidenceWeight,
    algorithmVersion,
  });

  return { id: evidence.id, isNew: true };
}

export async function invalidateEvidence(
  prisma: PrismaClient,
  params: InvalidateEvidenceParams
): Promise<void> {
  const { evidenceId, invalidatedByAdminId, invalidationReason, tx } = params;

  const client = tx || prisma;

  await client.reputationEvent.update({
    where: { id: evidenceId },
    data: {
      invalidatedAt: new Date(),
      invalidatedByAdminId,
      invalidationReason,
    },
  });

  log.warn('Reputation evidence invalidated', {
    evidenceId,
    invalidatedByAdminId,
    invalidationReason,
  });
}

export async function getActiveEvidence(
  prisma: PrismaClient,
  filter: EvidenceFilter
): Promise<any[]> {
  const { providerId, requestId, evidenceType, activeOnly = true, fromDate, toDate } = filter;

  const where: Prisma.ReputationEventWhereInput = {
    ...(providerId ? { providerId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(evidenceType ? { evidenceType } : {}),
    ...(activeOnly ? { invalidatedAt: null } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const evidence = await prisma.reputationEvent.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      provider: {
        select: { id: true, displayName: true, slug: true },
      },
      request: {
        select: { id: true },
      },
      sourceEvent: {
        select: { id: true, eventType: true, occurredAt: true },
      },
    },
  });

  return evidence;
}

export async function calculateEvidenceWeights(
  prisma: PrismaClient,
  providerId: string,
  activeOnly: boolean = true
): Promise<EvidenceWeightsSummary> {
  const evidence = await prisma.reputationEvent.findMany({
    where: {
      providerId,
      ...(activeOnly ? { invalidatedAt: null } : {}),
    },
    select: {
      evidenceType: true,
      evidenceWeight: true,
    },
  });

  let totalWeight = 0;
  const byType: Partial<Record<EvidenceType, number>> = {};

  for (const ev of evidence) {
    totalWeight += ev.evidenceWeight;
    byType[ev.evidenceType] = (byType[ev.evidenceType] || 0) + ev.evidenceWeight;
  }

  return {
    totalWeight,
    byType: byType as Record<EvidenceType, number>,
    count: evidence.length,
  };
}

export async function rebuildTrustScoreFromEvents(
  prisma: PrismaClient,
  providerId: string
): Promise<{
  completionHistoryScore: number;
  ratingQualityScore: number;
  requesterDiversityScore: number;
}> {
  const evidence = await prisma.reputationEvent.findMany({
    where: {
      providerId,
      invalidatedAt: null,
    },
    select: {
      evidenceType: true,
      evidenceWeight: true,
      requestId: true,
    },
  });

  let completionHistoryScore = 0;
  let ratingQualityScore = 0;
  const uniqueRequesters = new Set<string>();

  for (const ev of evidence) {
    if (ev.evidenceType === 'BILATERAL_COMPLETION') {
      completionHistoryScore += ev.evidenceWeight;
    }

    if (
      ev.evidenceType === 'UNILATERAL_REVIEW_QUALIFIED' ||
      ev.evidenceType === 'UNILATERAL_REVIEW_UNQUALIFIED'
    ) {
      ratingQualityScore += ev.evidenceWeight;
    }

    if (ev.requestId) {
      uniqueRequesters.add(ev.requestId);
    }
  }

  const requesterDiversityScore = uniqueRequesters.size;

  log.info('Trust score rebuilt from events', {
    providerId,
    completionHistoryScore,
    ratingQualityScore,
    requesterDiversityScore,
    evidenceCount: evidence.length,
  });

  return {
    completionHistoryScore,
    ratingQualityScore,
    requesterDiversityScore,
  };
}
