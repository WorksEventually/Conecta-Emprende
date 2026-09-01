-- CreateIndex
CREATE INDEX "RiskReport_providerId_status_generatedAt_idx" ON "RiskReport"("providerId", "status", "generatedAt");
