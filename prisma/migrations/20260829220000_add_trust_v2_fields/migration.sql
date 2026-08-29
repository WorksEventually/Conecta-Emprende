-- Add new value to ClosureOutcome enum
ALTER TYPE "ClosureOutcome" ADD VALUE IF NOT EXISTS 'CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT';

-- Add trust v2 fields to ProviderMetrics
ALTER TABLE "ProviderMetrics" ADD COLUMN IF NOT EXISTS "bilateralCompletions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProviderMetrics" ADD COLUMN IF NOT EXISTS "uniqueRequesters" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProviderMetrics" ADD COLUMN IF NOT EXISTS "lastRecalculatedAt" TIMESTAMP(3);

-- Add weight and editedAt to Review
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);

-- Create index on weight for bayesian queries
CREATE INDEX IF NOT EXISTS "Review_weight_idx" ON "Review"("weight");

-- Data migration: calculate bilateralCompletions from existing BILATERAL threads
UPDATE "ProviderMetrics" pm
SET "bilateralCompletions" = (
  SELECT COUNT(*) FROM "QuoteThread" qt
  WHERE qt."providerId" = pm."providerId"
    AND qt."closure_outcome" = 'BILATERAL'
);

-- Data migration: calculate uniqueRequesters from existing BILATERAL threads
UPDATE "ProviderMetrics" pm
SET "uniqueRequesters" = (
  SELECT COUNT(DISTINCT qt."senderId") FROM "QuoteThread" qt
  WHERE qt."providerId" = pm."providerId"
    AND qt."closure_outcome" = 'BILATERAL'
);

-- Data migration: existing reviews were bilateral → weight 1.0
UPDATE "Review" SET "weight" = 1.0 WHERE "weight" IS NULL;