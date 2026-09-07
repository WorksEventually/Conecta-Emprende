CREATE TABLE "ModerationActionApproval" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "suspendedUntil" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationActionApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationActionApproval_targetType_targetId_status_idx"
  ON "ModerationActionApproval"("targetType", "targetId", "status");
CREATE INDEX "ModerationActionApproval_requestedByUserId_status_idx"
  ON "ModerationActionApproval"("requestedByUserId", "status");
CREATE INDEX "ModerationActionApproval_approvedByUserId_idx"
  ON "ModerationActionApproval"("approvedByUserId");
CREATE INDEX "ModerationActionApproval_expiresAt_idx"
  ON "ModerationActionApproval"("expiresAt");

ALTER TABLE "ModerationActionApproval" ADD CONSTRAINT "ModerationActionApproval_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ModerationActionApproval" ADD CONSTRAINT "ModerationActionApproval_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
