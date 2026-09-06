-- Sprint 7: todas las reseñas deben conservar la solicitud que las habilitó.
-- Fase 0 auditó la base existente y no encontró reseñas con requestId NULL.
ALTER TABLE "Review"
  ALTER COLUMN "requestId" SET NOT NULL;

ALTER TABLE "Review"
  DROP CONSTRAINT IF EXISTS "Review_requestId_fkey";

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "QuoteThread"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
