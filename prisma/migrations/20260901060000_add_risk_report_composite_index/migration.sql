-- CreateIndex (guarded: defensive against db push drift, see PR #16)
CREATE INDEX IF NOT EXISTS "RiskReport_providerId_status_generatedAt_idx" ON "RiskReport"("providerId", "status", "generatedAt");
