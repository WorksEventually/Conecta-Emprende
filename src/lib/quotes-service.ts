import type { WorkflowPhase, ClosureOutcome, ModerationState } from "@prisma/client";
import { prisma } from "./db";
import { analyzeProviderRisk } from "./risk-telemetry-service";
import { emitRequestEvent } from "./request-events-service.js";
import { createReputationEvidence } from "./reputation-events-service.js";
import { recalculateProviderTrustScore } from "./trust-score-service";
import { createLogger } from "./logger.js";

const log = createLogger('QuotesService');

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

export async function updateThreadWithLocking(
  threadId: string,
  expectedVersion: number,
  updates: Record<string, any>,
  tx?: any
): Promise<void> {
  const db = tx || prisma;
  
  const updateData = {
    ...updates,
    version: { increment: 1 },
  };

  const result = await db.quoteThread.updateMany({
    where: {
      id: threadId,
      version: expectedVersion,
    },
    data: updateData,
  });

  if (result.count === 0) {
    log.warn('Optimistic locking conflict detected', {
      threadId,
      expectedVersion,
    });
    throw new ConcurrencyError(
      'El thread fue modificado por otro usuario. Por favor recargá la página.'
    );
  }

  log.info('Thread updated with optimistic locking', {
    threadId,
    oldVersion: expectedVersion,
    newVersion: expectedVersion + 1,
  });
}

export function getLegacyDisplayStatus(
  workflow_phase: WorkflowPhase | string,
  closure_outcome: ClosureOutcome | string | null
): string {
  if (workflow_phase === "CLOSED") {
    switch (closure_outcome) {
      case "BILATERAL": return "COMPLETED";
      case "CANCELLED_BY_REQUESTER": return "CLOSED_REQUESTER";
      case "CANCELLED_BY_PROVIDER": return "CLOSED_PROVIDER";
      case "CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT": return "CLOSED_PROVIDER";
      case "DECLINED_BY_PROVIDER": return "CLOSED_PROVIDER"; // Sprint 6
      case "EXPIRED_NO_PROVIDER_RESPONSE": return "CLOSED_EXPIRED"; // Sprint 6
      case "ACCOUNT_DEACTIVATED": return "CLOSED_DEACTIVATED"; // Sprint 6
      case "CLOSED_BY_ADMIN": return "CLOSED_ADMIN"; // Sprint 6
      default: return "CLOSED";
    }
  }
  if (workflow_phase === "COMPLETION_PENDING") return "IN_CONVERSATION";
  return "OPEN";
}

export interface QuoteThreadWithMessages {
  id: string;
  senderId: string;
  providerId: string;
  catalogItemId: string | null;
  subject: string;
  clientName: string | null;
  clientAvatar: string | null;
  dateLabel: string | null;
  status: string;
  workflow_phase: string;
  closure_outcome: string | null;
  moderation_state: string;
  completionDeadline: string | null;
  quotedPriceLabel: string | null;
  quotedDeliveryTime: string | null;
  acceptedQuotation: any;
  quotationHistory: any[];
  confirmedByRequesterAt: string | null;
  confirmedByProviderAt: string | null;
  completedAt: string | null;
  createdAt: Date;
  messages: any[];
  providerDisplayName?: string;
  providerSlug?: string;
}

function mapThread(t: any): QuoteThreadWithMessages {
  return {
    id: t.id,
    senderId: t.senderId,
    providerId: t.providerId,
    catalogItemId: t.catalogItemId,
    subject: t.subject,
    clientName: t.clientName || t.sender?.name || "Cliente",
    clientAvatar: t.clientAvatar || (t.sender?.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "CL"),
    dateLabel: t.dateLabel || computeDateLabel(t.createdAt),
    status: t.status || getLegacyDisplayStatus(t.workflow_phase, t.closure_outcome),
    workflow_phase: t.workflow_phase,
    closure_outcome: t.closure_outcome,
    moderation_state: t.moderation_state,
    completionDeadline: t.completionDeadline?.toISOString() || null,
    quotedPriceLabel: t.quotedPriceLabel,
    quotedDeliveryTime: t.quotedDeliveryTime,
    acceptedQuotation: t.acceptedQuotation,
    quotationHistory: t.quotationHistory || [],
    confirmedByRequesterAt: t.confirmedByRequesterAt?.toISOString() || null,
    confirmedByProviderAt: t.confirmedByProviderAt?.toISOString() || null,
    completedAt: t.completedAt?.toISOString() || null,
    createdAt: t.createdAt,
    providerDisplayName: t.provider?.displayName,
    providerSlug: t.provider?.slug,
    messages: t.messages.map((m: any) => ({
      id: m.id,
      author: m.authorRole,
      text: m.body,
      time: m.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    })),
  };
}

export async function getThreadsForParticipant(userId: string): Promise<QuoteThreadWithMessages[]> {
  const ownedProviders = await prisma.provider.findMany({
    where: { userId },
    select: { id: true },
  });
  const ownedProviderIds = ownedProviders.map(provider => provider.id);

  const threads = await prisma.quoteThread.findMany({
    where: {
      OR: [
        { senderId: userId },
        ...(ownedProviderIds.length ? [{ providerId: { in: ownedProviderIds } }] : []),
      ],
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      sender: {
        select: { id: true, name: true, image: true },
      },
      provider: {
        select: { id: true, displayName: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return threads.map(mapThread);
}

export async function getThreadsByProvider(providerId: string): Promise<QuoteThreadWithMessages[]> {
  const threads = await prisma.quoteThread.findMany({
    where: { providerId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      sender: {
        select: { id: true, name: true, image: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return threads.map(mapThread);
}

export async function getThreadsBySender(senderId: string): Promise<QuoteThreadWithMessages[]> {
  const threads = await prisma.quoteThread.findMany({
    where: { senderId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      sender: {
        select: { id: true, name: true, image: true },
      },
      provider: {
        select: { id: true, displayName: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return threads.map(mapThread);
}

export async function createThread(data: {
  senderId: string;
  providerId: string;
  catalogItemId?: string;
  subject: string;
  initialMessage: string;
}): Promise<QuoteThreadWithMessages> {
  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.quoteThread.create({
      data: {
        senderId: data.senderId,
        providerId: data.providerId,
        catalogItemId: data.catalogItemId || null,
        subject: data.subject,
        status: "OPEN",
      },
    });

    await tx.quoteMessage.create({
      data: {
        threadId: thread.id,
        authorId: data.senderId,
        authorRole: "client",
        body: data.initialMessage,
      },
    });

    await emitRequestEvent(prisma, {
      requestId: thread.id,
      eventType: 'REQUEST_CREATED',
      actorUserId: data.senderId,
      metadata: {
        subject: data.subject,
        providerId: data.providerId,
        catalogItemId: data.catalogItemId,
      },
      tx,
    });

    log.info('Thread created with REQUEST_CREATED event', {
      threadId: thread.id,
      senderId: data.senderId,
      providerId: data.providerId,
    });

    return thread;
  });

  const full = await getThreadById(result.id);
  return full!;
}

async function resolveTimeoutInline(thread: any): Promise<void> {
  const now = new Date();
  
  if (
    thread.workflow_phase !== 'COMPLETION_PENDING' ||
    !thread.completionDeadline ||
    thread.completionDeadline.getTime() > now.getTime()
  ) {
    return;
  }

  log.info('Lazy expiration triggered', { threadId: thread.id });

  const { confirmedByRequesterAt, confirmedByProviderAt } = thread;
  let closure_outcome: ClosureOutcome;

  if (confirmedByRequesterAt && confirmedByProviderAt) {
    closure_outcome = 'BILATERAL' as ClosureOutcome;
  } else if (confirmedByRequesterAt && !confirmedByProviderAt) {
    closure_outcome = 'REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE' as ClosureOutcome;
  } else if (confirmedByProviderAt && !confirmedByRequesterAt) {
    closure_outcome = 'PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE' as ClosureOutcome;
  } else {
    log.warn('Thread in COMPLETION_PENDING without confirmations', { 
      threadId: thread.id 
    });
    closure_outcome = 'CANCELLED_BY_REQUESTER' as ClosureOutcome;
  }

  let legacyStatus: string;
  switch (closure_outcome) {
    case 'BILATERAL':
      legacyStatus = "COMPLETED";
      break;
    case 'REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE':
      legacyStatus = "CLOSED_PROVIDER";
      break;
    case 'PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE':
      legacyStatus = "CLOSED_REQUESTER";
      break;
    default:
      legacyStatus = "CLOSED";
  }

  await prisma.$transaction(async (tx) => {
    try {
      await updateThreadWithLocking(
        thread.id,
        thread.version,
        { 
          workflow_phase: 'CLOSED' as WorkflowPhase, 
          closure_outcome, 
          completedAt: now, 
          status: legacyStatus 
        },
        tx
      );
    } catch (error) {
      if (error instanceof ConcurrencyError) {
        log.info('Lazy expiration detected concurrent update, skipping', {
          threadId: thread.id,
        });
        return;
      }
      throw error;
    }

    const timeoutEvent = await emitRequestEvent(prisma, {
      requestId: thread.id,
      eventType: 'COMPLETION_TIMEOUT',
      completionCycleNo: thread.cycleNo || 0,
      metadata: {
        outcome: closure_outcome,
        deadline: thread.completionDeadline?.toISOString(),
        confirmedByRequester: !!confirmedByRequesterAt,
        confirmedByProvider: !!confirmedByProviderAt,
        lazyExpiration: true,
      },
      tx,
    });

    if (closure_outcome === 'BILATERAL') {
      await createReputationEvidence(prisma, {
        providerId: thread.providerId,
        requestId: thread.id,
        evidenceType: 'BILATERAL_COMPLETION',
        evidenceWeight: 1.0,
        sourceEventId: timeoutEvent.id,
        tx,
      });
    }

    log.info('Thread closed by lazy expiration', { 
      threadId: thread.id, 
      outcome: closure_outcome 
    });
  });

  if (closure_outcome === 'BILATERAL') {
    recalculateProviderTrustScore(thread.providerId)
      .catch((err) => log.error('TrustScore lazy recalc failed', { error: err }));
    
    analyzeProviderRisk(thread.providerId)
      .catch((err) => log.error('RiskTelemetry lazy analysis failed', { error: err }));
  }
}

export async function getThreadById(threadId: string): Promise<QuoteThreadWithMessages | null> {
  const t = await prisma.quoteThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      sender: {
        select: { id: true, name: true, image: true },
      },
      provider: {
        select: { id: true, displayName: true, slug: true },
      },
    },
  });

  if (!t) return null;

  await resolveTimeoutInline(t);

  const refreshed = await prisma.quoteThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      sender: {
        select: { id: true, name: true, image: true },
      },
      provider: {
        select: { id: true, displayName: true, slug: true },
      },
    },
  });

  return refreshed ? mapThread(refreshed) : null;
}

export async function addMessage(threadId: string, data: {
  authorId: string;
  authorRole: "client" | "provider" | "system";
  body: string;
}): Promise<any> {
  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.quoteMessage.create({
      data: {
        threadId,
        authorId: data.authorId,
        authorRole: data.authorRole,
        body: data.body,
      },
    });

    const thread = await tx.quoteThread.findUnique({
      where: { id: threadId },
      select: { 
        status: true, 
        messages: { 
          where: { authorRole: 'provider' },
          select: { id: true } 
        } 
      },
    });

    if (thread?.status === "OPEN") {
      await tx.quoteThread.update({
        where: { id: threadId },
        data: { status: "IN_CONVERSATION" },
      });
    }

    if (data.authorRole === 'provider' && thread && thread.messages.length === 1) {
      await emitRequestEvent(prisma, {
        requestId: threadId,
        eventType: 'PROVIDER_RESPONDED',
        actorUserId: data.authorId,
        metadata: { firstResponse: true },
        tx,
      });

      log.info('Provider first response event emitted', {
        threadId,
        providerId: data.authorId,
      });
    }

    return message;
  });

  return result;
}

export async function updateThread(threadId: string, data: {
  status?: string;
  quotedPriceLabel?: string;
  quotedDeliveryTime?: string;
  confirmedByRequesterAt?: boolean;
  confirmedByProviderAt?: boolean;
}): Promise<any> {
  const updateData: Record<string, any> = {};

  if (data.status) {
    updateData.status = data.status;
  }
  if (data.quotedPriceLabel !== undefined) {
    updateData.quotedPriceLabel = data.quotedPriceLabel;
  }
  if (data.quotedDeliveryTime !== undefined) {
    updateData.quotedDeliveryTime = data.quotedDeliveryTime;
  }
  if (data.confirmedByRequesterAt) {
    updateData.confirmedByRequesterAt = new Date();
  }
  if (data.confirmedByProviderAt) {
    updateData.confirmedByProviderAt = new Date();
  }

  // Cierre explícito del proveedor: distinguir si hubo interacción previa
  // para asignar CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT (habilita reseña 0.5)
  // vs CANCELLED_BY_PROVIDER (sin reseña).
  if (data.status === "CLOSED_PROVIDER") {
    const current = await prisma.quoteThread.findUnique({
      where: { id: threadId },
      include: { messages: { select: { id: true } } },
    });

    if (current) {
      const hasEngagement =
        (current.messages?.length ?? 0) >= 2 ||
        !!current.quotedPriceLabel ||
        !!current.acceptedQuotation;

      updateData.closure_outcome = hasEngagement
        ? "CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT"
        : "CANCELLED_BY_PROVIDER";
      updateData.workflow_phase = "CLOSED";
    }
  }

  const thread = await prisma.quoteThread.update({
    where: { id: threadId },
    data: updateData,
  });

  // If both confirmations exist, mark as COMPLETED
  if (thread.confirmedByRequesterAt && thread.confirmedByProviderAt) {
    await prisma.quoteThread.update({
      where: { id: threadId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    analyzeProviderRisk(thread.providerId)
      .catch((err) => console.error("[RiskTelemetry] Analysis failed:", err));
  }

  return thread;
}

function computeDateLabel(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  if (days < 14) return "Hace 1 semana";
  if (days < 30) return `Hace ${Math.floor(days / 7)} semanas`;
  return date.toLocaleDateString("es-NI", { month: "short", day: "numeric" });
}
