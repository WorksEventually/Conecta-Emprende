CREATE TABLE "RiskSignalEvidence" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "riskReportId" TEXT,
    "signalKey" TEXT NOT NULL,
    "observedValue" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "contribution" DOUBLE PRECISION NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "sourceEventIds" JSONB,
    "algorithmVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskSignalEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RiskSignalEvidence_providerId_createdAt_idx" ON "RiskSignalEvidence"("providerId", "createdAt");
CREATE INDEX "RiskSignalEvidence_providerId_signalKey_createdAt_idx" ON "RiskSignalEvidence"("providerId", "signalKey", "createdAt");
CREATE INDEX "RiskSignalEvidence_riskReportId_idx" ON "RiskSignalEvidence"("riskReportId");
CREATE INDEX "RiskSignalEvidence_algorithmVersion_idx" ON "RiskSignalEvidence"("algorithmVersion");

ALTER TABLE "RiskSignalEvidence" ADD CONSTRAINT "RiskSignalEvidence_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RiskSignalEvidence" ADD CONSTRAINT "RiskSignalEvidence_riskReportId_fkey"
  FOREIGN KEY ("riskReportId") REFERENCES "RiskReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
