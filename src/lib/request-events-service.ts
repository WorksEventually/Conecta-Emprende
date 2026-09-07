import { PrismaClient, RequestEventType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { createLogger } from './logger.js';

const log = createLogger('RequestEvents');

export interface EmitRequestEventParams {
  requestId: string;
  eventType: RequestEventType;
  actorUserId?: string;
  completionCycleNo?: number;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  tx?: Prisma.TransactionClient;
}

export interface RequestEventFilter {
  requestId?: string;
  eventType?: RequestEventType;
  actorUserId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export function generateIdempotencyKey(
  requestId: string,
  eventType: RequestEventType,
  actorUserId: string | undefined,
  completionCycleNo: number
): string {
  const payload = JSON.stringify({
    requestId,
    eventType,
    actorUserId: actorUserId || 'system',
    completionCycleNo,
  });

  return createHash('sha256').update(payload).digest('hex');
}

export async function eventExists(
  prisma: PrismaClient | Prisma.TransactionClient,
  idempotencyKey: string
): Promise<boolean> {
  const existing = await prisma.requestEvent.findUnique({
    where: { idempotencyKey },
  });

  return existing !== null;
}

export async function emitRequestEvent(
  prisma: PrismaClient,
  params: EmitRequestEventParams
): Promise<{ id: string; idempotencyKey: string; isNew: boolean }> {
  const {
    requestId,
    eventType,
    actorUserId,
    completionCycleNo = 0,
    metadata,
    occurredAt = new Date(),
    tx,
  } = params;

  const idempotencyKey = generateIdempotencyKey(
    requestId,
    eventType,
    actorUserId,
    completionCycleNo
  );

  const client = tx || prisma;

  const existing = await client.requestEvent.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    log.info('Event already exists (idempotent)', {
      requestId,
      eventType,
      idempotencyKey,
      existingEventId: existing.id,
    });

    return {
      id: existing.id,
      idempotencyKey: existing.idempotencyKey,
      isNew: false,
    };
  }

  const event = await client.requestEvent.create({
    data: {
      requestId,
      eventType,
      actorUserId,
      completionCycleNo,
      idempotencyKey,
      metadataJson: metadata ? (metadata as Prisma.JsonObject) : undefined,
      occurredAt,
    },
  });

  log.info('Event emitted', {
    eventId: event.id,
    requestId,
    eventType,
    actorUserId,
    completionCycleNo,
    idempotencyKey,
  });

  return {
    id: event.id,
    idempotencyKey: event.idempotencyKey,
    isNew: true,
  };
}

export async function getRequestEventHistory(
  prisma: PrismaClient,
  filter: RequestEventFilter
): Promise<
  Array<{
    id: string;
    requestId: string;
    eventType: RequestEventType;
    actorUserId: string | null;
    completionCycleNo: number;
    metadataJson: Prisma.JsonValue | null;
    occurredAt: Date;
    createdAt: Date;
    actor: { id: string; name: string | null; email: string } | null;
  }>
> {
  const where: Prisma.RequestEventWhereInput = {};

  if (filter.requestId) {
    where.requestId = filter.requestId;
  }

  if (filter.eventType) {
    where.eventType = filter.eventType;
  }

  if (filter.actorUserId) {
    where.actorUserId = filter.actorUserId;
  }

  if (filter.fromDate || filter.toDate) {
    where.occurredAt = {};
    if (filter.fromDate) {
      where.occurredAt.gte = filter.fromDate;
    }
    if (filter.toDate) {
      where.occurredAt.lte = filter.toDate;
    }
  }

  const events = await prisma.requestEvent.findMany({
    where,
    orderBy: { occurredAt: 'asc' },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return events;
}

export interface ReplayedState {
  workflow_phase: 'OPEN' | 'COMPLETION_PENDING' | 'CLOSED';
  closure_outcome?: string;
  confirmedByRequesterAt?: Date;
  confirmedByProviderAt?: Date;
  completedAt?: Date;
  cycleNo: number;
}

export async function replayRequestEvents(
  prisma: PrismaClient,
  requestId: string
): Promise<ReplayedState> {
  const events = await getRequestEventHistory(prisma, { requestId });

  const state: ReplayedState = {
    workflow_phase: 'OPEN',
    closure_outcome: undefined,
    confirmedByRequesterAt: undefined,
    confirmedByProviderAt: undefined,
    completedAt: undefined,
    cycleNo: 0,
  };

  for (const event of events) {
    switch (event.eventType) {
      case 'REQUEST_CREATED':
        state.workflow_phase = 'OPEN';
        break;

      case 'COMPLETION_REQUESTED':
        state.workflow_phase = 'COMPLETION_PENDING';
        state.cycleNo = event.completionCycleNo;
        
        if (event.metadataJson && typeof event.metadataJson === 'object') {
          const meta = event.metadataJson as Record<string, unknown>;
          if (meta.actor === 'requester') {
            state.confirmedByRequesterAt = event.occurredAt;
          } else if (meta.actor === 'provider') {
            state.confirmedByProviderAt = event.occurredAt;
          }
        }
        break;

      case 'COMPLETION_CONFIRMED':
        state.workflow_phase = 'CLOSED';
        state.closure_outcome = 'BILATERAL';
        state.completedAt = event.occurredAt;
        break;

      case 'COMPLETION_TIMEOUT':
        state.workflow_phase = 'CLOSED';
        
        if (event.metadataJson && typeof event.metadataJson === 'object') {
          const meta = event.metadataJson as Record<string, unknown>;
          state.closure_outcome = meta.outcome as string;
        }
        state.completedAt = event.occurredAt;
        break;

      case 'CANCELLED_BY_REQUESTER':
        state.workflow_phase = 'CLOSED';
        state.closure_outcome = 'CANCELLED_BY_REQUESTER';
        state.completedAt = event.occurredAt;
        break;

      case 'CANCELLED_BY_PROVIDER':
        state.workflow_phase = 'CLOSED';
        
        if (event.metadataJson && typeof event.metadataJson === 'object') {
          const meta = event.metadataJson as Record<string, unknown>;
          state.closure_outcome = meta.hasEngagement
            ? 'CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT'
            : 'CANCELLED_BY_PROVIDER';
        } else {
          state.closure_outcome = 'CANCELLED_BY_PROVIDER';
        }
        state.completedAt = event.occurredAt;
        break;

      case 'MODERATION_CLOSURE':
        state.workflow_phase = 'CLOSED';
        state.closure_outcome = 'MODERATION_CLOSURE';
        state.completedAt = event.occurredAt;
        break;
    }
  }

  log.debug('State replayed from events', {
    requestId,
    eventCount: events.length,
    finalState: state,
  });

  return state;
}
