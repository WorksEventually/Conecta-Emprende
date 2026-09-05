-- Sprint 6: Máquina de Estados COMPLETA
-- Agregar 4 nuevos valores a ClosureOutcome (para completar los 9 de P2 §2.2)
ALTER TYPE "ClosureOutcome" ADD VALUE 'DECLINED_BY_PROVIDER';
ALTER TYPE "ClosureOutcome" ADD VALUE 'EXPIRED_NO_PROVIDER_RESPONSE';
ALTER TYPE "ClosureOutcome" ADD VALUE 'ACCOUNT_DEACTIVATED';
ALTER TYPE "ClosureOutcome" ADD VALUE 'CLOSED_BY_ADMIN';

-- Agregar 4 nuevos valores a RequestEventType (P2 §4.3, §4.4)
ALTER TYPE "RequestEventType" ADD VALUE 'COMPLETION_NOT_ACCEPTED';
ALTER TYPE "RequestEventType" ADD VALUE 'COMPLETION_REQUEST_WITHDRAWN';
ALTER TYPE "RequestEventType" ADD VALUE 'REQUEST_DECLINED';
ALTER TYPE "RequestEventType" ADD VALUE 'REQUEST_EXPIRED';

-- Agregar campos a QuoteThread para tracking de rechazo/withdrawal
ALTER TABLE "QuoteThread" ADD COLUMN "completion_initiator_user_id" TEXT;
ALTER TABLE "QuoteThread" ADD COLUMN "completion_rejected_at" TIMESTAMP(3);
ALTER TABLE "QuoteThread" ADD COLUMN "completion_rejected_by_user_id" TEXT;
ALTER TABLE "QuoteThread" ADD COLUMN "last_nonsystemic_message_at" TIMESTAMP(3);
