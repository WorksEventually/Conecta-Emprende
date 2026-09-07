-- Preserve every private feedback revision before updating the current view.
CREATE TABLE "ProviderPrivateFeedbackHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feedbackId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderPrivateFeedbackHistory_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "ProviderPrivateFeedback" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProviderPrivateFeedbackHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProviderPrivateFeedbackHistory_feedbackId_recordedAt_idx" ON "ProviderPrivateFeedbackHistory" ("feedbackId", "recordedAt");
CREATE INDEX "ProviderPrivateFeedbackHistory_authorId_idx" ON "ProviderPrivateFeedbackHistory" ("authorId");
