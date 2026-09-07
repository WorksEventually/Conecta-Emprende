ALTER TABLE "Provider"
  ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3);

UPDATE "Provider"
SET "activatedAt" = "createdAt"
WHERE "activatedAt" IS NULL
  AND "status" <> 'DRAFT';

ALTER TABLE "ProviderMetrics"
  ADD COLUMN IF NOT EXISTS "publicScoreFrozen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "growthHold" BOOLEAN NOT NULL DEFAULT false;
