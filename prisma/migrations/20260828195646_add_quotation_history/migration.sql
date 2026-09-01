-- Add quotationHistory field (JSON array for audit trail)
ALTER TABLE "QuoteThread" ADD COLUMN "quotationHistory" JSONB DEFAULT '[]'::jsonb;

-- Add acceptedQuotation field (event of client accepting a price)
ALTER TABLE "QuoteThread" ADD COLUMN "acceptedQuotation" JSONB;

-- Migrate existing quotedPriceLabel/quotedDeliveryTime to quotationHistory
UPDATE "QuoteThread"
SET "quotationHistory" = jsonb_build_array(
  jsonb_build_object(
    'price', "quotedPriceLabel",
    'delivery', "quotedDeliveryTime",
    'providerId', (SELECT "userId" FROM "Provider" WHERE "Provider"."id" = "QuoteThread"."providerId"),
    'timestamp', "createdAt"
  )
)
WHERE "quotedPriceLabel" IS NOT NULL;

-- Add comments documenting the fields
COMMENT ON COLUMN "QuoteThread"."quotationHistory" IS 'Array of all quotations sent by provider (audit trail). Each entry: {price, delivery, providerId, timestamp}';
COMMENT ON COLUMN "QuoteThread"."acceptedQuotation" IS 'Event of client accepting a price. Format: {price, delivery, acceptedAt, acceptedBy}. NULL if not accepted yet.';