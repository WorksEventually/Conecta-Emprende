ALTER TABLE "RiskReport"
  ADD COLUMN "riskLevel" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "penalty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "algorithmVersion" TEXT NOT NULL DEFAULT 'risk-v1.0.0';

ALTER TABLE "ReputationEvent"
  ADD COLUMN "riskReportId" TEXT;

CREATE INDEX "ReputationEvent_riskReportId_idx" ON "ReputationEvent"("riskReportId");
CREATE UNIQUE INDEX "ReputationEvent_riskReportId_evidenceType_key"
  ON "ReputationEvent"("riskReportId", "evidenceType");

ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_riskReportId_fkey"
  FOREIGN KEY ("riskReportId") REFERENCES "RiskReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
