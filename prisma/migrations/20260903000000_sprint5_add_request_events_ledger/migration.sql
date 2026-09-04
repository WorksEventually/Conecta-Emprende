-- CreateEnum
CREATE TYPE "RequestEventType" AS ENUM ('REQUEST_CREATED', 'PROVIDER_RESPONDED', 'QUOTE_ACCEPTED', 'COMPLETION_REQUESTED', 'COMPLETION_CONFIRMED', 'COMPLETION_TIMEOUT', 'CANCELLED_BY_REQUESTER', 'CANCELLED_BY_PROVIDER', 'MODERATION_FLAG', 'MODERATION_CLOSURE', 'REOPENED', 'MESSAGE_SENT', 'DEADLINE_EXTENDED', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('BILATERAL_COMPLETION', 'UNILATERAL_REVIEW_QUALIFIED', 'UNILATERAL_REVIEW_UNQUALIFIED', 'CONTACT_CONFIRMATION', 'PENALTY_SUSPICIOUS_ACTIVITY', 'PENALTY_POLICY_VIOLATION');

-- AlterTable QuoteThread: Add version and cycleNo for optimistic locking
ALTER TABLE "QuoteThread" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "QuoteThread" ADD COLUMN "cycleNo" INTEGER NOT NULL DEFAULT 0;

-- CreateTable RequestEvent
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "eventType" "RequestEventType" NOT NULL,
    "actorUserId" TEXT,
    "completionCycleNo" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable ReputationEvent
CREATE TABLE "ReputationEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "requestId" TEXT,
    "evidenceType" "EvidenceType" NOT NULL,
    "evidenceWeight" DOUBLE PRECISION NOT NULL,
    "sourceEventId" TEXT,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'trust-v2.0.0',
    "invalidatedAt" TIMESTAMP(3),
    "invalidatedByAdminId" TEXT,
    "invalidationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequestEvent_idempotencyKey_key" ON "RequestEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_occurredAt_idx" ON "RequestEvent"("requestId", "occurredAt");

-- CreateIndex
CREATE INDEX "RequestEvent_eventType_idx" ON "RequestEvent"("eventType");

-- CreateIndex
CREATE INDEX "RequestEvent_idempotencyKey_idx" ON "RequestEvent"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationEvent_requestId_evidenceType_key" ON "ReputationEvent"("requestId", "evidenceType");

-- CreateIndex
CREATE INDEX "ReputationEvent_providerId_createdAt_idx" ON "ReputationEvent"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReputationEvent_evidenceType_idx" ON "ReputationEvent"("evidenceType");

-- CreateIndex
CREATE INDEX "ReputationEvent_algorithmVersion_idx" ON "ReputationEvent"("algorithmVersion");

-- CreateIndex
CREATE INDEX "ReputationEvent_sourceEventId_idx" ON "ReputationEvent"("sourceEventId");

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuoteThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuoteThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "RequestEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_invalidatedByAdminId_fkey" FOREIGN KEY ("invalidatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
