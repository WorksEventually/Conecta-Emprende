-- Sprint 7: feedback privado del proveedor sobre el solicitante.
CREATE TABLE "ProviderPrivateFeedback" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderPrivateFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderPrivateFeedback_requestId_key" ON "ProviderPrivateFeedback"("requestId");
CREATE INDEX "ProviderPrivateFeedback_providerId_idx" ON "ProviderPrivateFeedback"("providerId");
CREATE INDEX "ProviderPrivateFeedback_authorId_idx" ON "ProviderPrivateFeedback"("authorId");

ALTER TABLE "ProviderPrivateFeedback"
  ADD CONSTRAINT "ProviderPrivateFeedback_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "QuoteThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderPrivateFeedback"
  ADD CONSTRAINT "ProviderPrivateFeedback_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderPrivateFeedback"
  ADD CONSTRAINT "ProviderPrivateFeedback_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
