import type { WorkflowPhase, ClosureOutcome, ModerationState } from "@prisma/client";
import { prisma } from "./db";
import { analyzeProviderRisk } from "./risk-telemetry-service";

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
  const thread = await prisma.quoteThread.create({
    data: {
      senderId: data.senderId,
      providerId: data.providerId,
      catalogItemId: data.catalogItemId || null,
      subject: data.subject,
      status: "OPEN",
    },
  });

  await prisma.quoteMessage.create({
    data: {
      threadId: thread.id,
      authorId: data.senderId,
      authorRole: "client",
      body: data.initialMessage,
    },
  });

  const full = await getThreadById(thread.id);
  return full!;
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

  return mapThread(t);
}

export async function addMessage(threadId: string, data: {
  authorId: string;
  authorRole: "client" | "provider" | "system";
  body: string;
}): Promise<any> {
  const message = await prisma.quoteMessage.create({
    data: {
      threadId,
      authorId: data.authorId,
      authorRole: data.authorRole,
      body: data.body,
    },
  });

  // Update thread status if it's the first message
  const thread = await prisma.quoteThread.findUnique({
    where: { id: threadId },
    select: { status: true },
  });

  if (thread?.status === "OPEN") {
    await prisma.quoteThread.update({
      where: { id: threadId },
      data: { status: "IN_CONVERSATION" },
    });
  }

  return message;
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
