-- Preserve audit history for system-driven events that do not have a human actor.
ALTER TABLE "ModerationAuditLog"
  DROP CONSTRAINT IF EXISTS "ModerationAuditLog_actorUserId_fkey";

ALTER TABLE "ModerationAuditLog"
  ALTER COLUMN "actorUserId" DROP NOT NULL;

ALTER TABLE "ModerationAuditLog"
  ADD CONSTRAINT "ModerationAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
