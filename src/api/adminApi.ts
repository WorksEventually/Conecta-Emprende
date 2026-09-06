import { apiRequest } from "./http";

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest<{ success: boolean; data: T; error?: string }>(path, init);
  if (!response.success) throw new Error(response.error || "Error administrativo");
  return response.data;
}

export type AdminRiskReportStatus = "OPEN" | "UNDER_REVIEW" | "DISMISSED" | "ESCALATED" | "ACTION_TAKEN";

export interface ModerationActionApproval {
  id: string;
  action: "SUSPEND" | "BAN";
  targetType: "PROVIDER";
  targetId: string;
  requestedByUserId: string;
  requestedBy?: { id: string; name: string | null };
  approvedByUserId: string | null;
  status: "PENDING" | "APPROVED" | "EXPIRED";
  reason: string;
  suspendedUntil: string | null;
  requestedAt: string;
  approvedAt: string | null;
  expiresAt: string;
}

export interface AdminRiskReport {
  id: string;
  providerId: string;
  provider: {
    id: string;
    displayName: string;
    slug: string;
    status: "ACTIVE" | "DRAFT" | "INACTIVE" | "TEMPORARILY_RESTRICTED" | "SUSPENDED" | "BANNED" | string;
    statusReason: string | null;
    suspendedUntil: string | null;
    city: string;
    category: string;
  };
  riskScore: number;
  riskLevel: "normal" | "unusual" | "suspicious" | "high-risk";
  penalty: number;
  algorithmVersion: string;
  signals: {
    suspiciousCyclesCount: number;
    avgSearchTimeSeconds: number | null;
    avgRequestToCompletionMinutes: number | null;
    avgMessagesPerRequest: number | null;
    newAccountsPercentage: number | null;
    ratingConcentrationScore: number | null;
  };
  signalEvidence: Array<{
    id: string;
    signalKey: string;
    observedValue: number | null;
    threshold: number | null;
    contribution: number;
    windowStart: string;
    windowEnd: string;
    algorithmVersion: string;
  }>;
  status: AdminRiskReportStatus;
  reviewerNotes: string | null;
  recommendedAction: string | null;
  generatedAt: string;
  reviewedAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
}

export interface ModerationAuditLog {
  id: string;
  actorUserId: string;
  actor?: { id: string; name: string | null; email: string };
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export type RequestEventType =
  | "REQUEST_CREATED"
  | "PROVIDER_RESPONDED"
  | "QUOTE_ACCEPTED"
  | "COMPLETION_REQUESTED"
  | "COMPLETION_CONFIRMED"
  | "COMPLETION_TIMEOUT"
  | "CANCELLED_BY_REQUESTER"
  | "CANCELLED_BY_PROVIDER"
  | "MODERATION_FLAG"
  | "MODERATION_CLOSURE"
  | "REOPENED"
  | "MESSAGE_SENT"
  | "DEADLINE_EXTENDED"
  | "ADMIN_OVERRIDE";

export interface RequestEvent {
  id: string;
  requestId: string;
  eventType: RequestEventType;
  actorUserId: string | null;
  actor: { id: string; name: string | null; email: string } | null;
  completionCycleNo: number;
  idempotencyKey: string;
  metadataJson: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
}

export const adminApi = {
  getRiskReports: (status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return adminRequest<AdminRiskReport[]>(`/api/admin/risk-reports${query}`);
  },
  updateRiskReportStatus: (reportId: string, data: { status: AdminRiskReportStatus; reviewerNotes?: string; reason?: string }) =>
    adminRequest<AdminRiskReport>(`/api/admin/risk-reports/${encodeURIComponent(reportId)}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  escalateRiskReport: (reportId: string, reviewerNotes: string) =>
    adminRequest<AdminRiskReport>(`/api/admin/risk-reports/${encodeURIComponent(reportId)}/escalate`, {
      method: "POST",
      body: JSON.stringify({ reviewerNotes }),
    }),
  suspendProvider: (providerId: string, data: { reason: string; suspendedUntil?: string }) =>
    adminRequest(`/api/admin/providers/${encodeURIComponent(providerId)}/suspend`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  restrictProvider: (providerId: string, data: { reason: string; suspendedUntil?: string }) =>
    adminRequest(`/api/admin/providers/${encodeURIComponent(providerId)}/restrict`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  inactivateProvider: (providerId: string, reason: string) =>
    adminRequest(`/api/admin/providers/${encodeURIComponent(providerId)}/inactivate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  banProvider: (providerId: string, reason: string) =>
    adminRequest(`/api/admin/providers/${encodeURIComponent(providerId)}/ban`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  requestModerationApproval: (providerId: string, data: { action: "SUSPEND" | "BAN"; reason: string; suspendedUntil?: string }) =>
    adminRequest<ModerationActionApproval>(`/api/admin/providers/${encodeURIComponent(providerId)}/moderation-approvals`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  approveModerationAction: (approvalId: string) =>
    adminRequest(`/api/admin/moderation-approvals/${encodeURIComponent(approvalId)}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  getModerationApprovals: () => adminRequest<ModerationActionApproval[]>("/api/admin/moderation-approvals"),
  reactivateProvider: (providerId: string, reason: string) =>
    adminRequest(`/api/admin/providers/${encodeURIComponent(providerId)}/reactivate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  getAuditLog: () => adminRequest<ModerationAuditLog[]>("/api/admin/audit-log"),
  getThreadEvents: (threadId: string, eventType?: RequestEventType) => {
    const query = eventType ? `?eventType=${encodeURIComponent(eventType)}` : "";
    return adminRequest<RequestEvent[]>(`/api/admin/threads/${encodeURIComponent(threadId)}/events${query}`);
  },
};
