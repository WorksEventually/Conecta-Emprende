-- CreateTable
CREATE TABLE "ReviewHistory" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "qualityScore" INTEGER NOT NULL,
    "responseTimeScore" INTEGER NOT NULL,
    "fulfillmentScore" INTEGER NOT NULL,
    "communicationScore" INTEGER NOT NULL,
    "valueScore" INTEGER NOT NULL,
    "generalScore" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedByUserId" TEXT NOT NULL,

    CONSTRAINT "ReviewHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewHistory_reviewId_idx" ON "ReviewHistory"("reviewId");

-- AddForeignKey
ALTER TABLE "ReviewHistory" ADD CONSTRAINT "ReviewHistory_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;