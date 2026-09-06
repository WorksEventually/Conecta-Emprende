ALTER TABLE "Provider" ADD COLUMN "riskLineageRootId" TEXT;

UPDATE "Provider" SET "riskLineageRootId" = "id";

CREATE INDEX "Provider_riskLineageRootId_idx" ON "Provider"("riskLineageRootId");

ALTER TABLE "Provider" ADD CONSTRAINT "Provider_riskLineageRootId_fkey"
  FOREIGN KEY ("riskLineageRootId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ModerationActionApproval" ADD COLUMN "riskReportId" TEXT;

CREATE INDEX "ModerationActionApproval_riskReportId_idx" ON "ModerationActionApproval"("riskReportId");

ALTER TABLE "ModerationActionApproval" ADD CONSTRAINT "ModerationActionApproval_riskReportId_fkey"
  FOREIGN KEY ("riskReportId") REFERENCES "RiskReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
