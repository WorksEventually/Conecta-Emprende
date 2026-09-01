-- Baseline for the 3-axis quote model (Sprint 1, Task 1.3).
--
-- This structure was originally applied with `prisma db push` and was never
-- captured as a migration, so `prisma migrate deploy` on a fresh database
-- produced a schema without it and later migrations failed (P2022 /
-- `type "ClosureOutcome" does not exist`). This step recreates the structure
-- idempotently so that:
--   * fresh databases built with `prisma migrate deploy` get the full schema;
--   * databases that already have the structure (previously synced via
--     `db push`) are left unchanged.
--
-- Refs: P2_DEFINITIVE_RULES.md §2 (workflow phases / closure outcomes),
-- PR #13 post-merge checklist, PR #14 review.

-- CreateEnum (guarded: CREATE TYPE has no IF NOT EXISTS in PostgreSQL)
DO $$ BEGIN
  CREATE TYPE "WorkflowPhase" AS ENUM ('OPEN', 'COMPLETION_PENDING', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClosureOutcome" AS ENUM ('BILATERAL', 'REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE', 'PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE', 'CANCELLED_BY_REQUESTER', 'CANCELLED_BY_PROVIDER', 'CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT', 'MODERATION_CLOSURE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ModerationState" AS ENUM ('CLEAN', 'FLAGGED', 'RESTRICTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "QuoteThread" ADD COLUMN IF NOT EXISTS "workflow_phase" "WorkflowPhase" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "QuoteThread" ADD COLUMN IF NOT EXISTS "closure_outcome" "ClosureOutcome";
ALTER TABLE "QuoteThread" ADD COLUMN IF NOT EXISTS "moderation_state" "ModerationState" NOT NULL DEFAULT 'CLEAN';
ALTER TABLE "QuoteThread" ADD COLUMN IF NOT EXISTS "completionDeadline" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuoteThread_workflow_phase_idx" ON "QuoteThread"("workflow_phase");
CREATE INDEX IF NOT EXISTS "QuoteThread_completionDeadline_idx" ON "QuoteThread"("completionDeadline");
