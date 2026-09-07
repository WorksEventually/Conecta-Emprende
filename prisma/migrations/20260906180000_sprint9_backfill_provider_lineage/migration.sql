-- Group legacy standalone profiles by their owning user without overriding
-- lineages that were already explicitly linked to a different root.
WITH canonical_roots AS (
  SELECT DISTINCT ON ("userId")
    "userId",
    "id" AS "rootId"
  FROM "Provider"
  WHERE "riskLineageRootId" IS NULL OR "riskLineageRootId" = "id"
  ORDER BY "userId", "createdAt", "id"
)
UPDATE "Provider" AS member
SET "riskLineageRootId" = roots."rootId"
FROM canonical_roots AS roots
WHERE member."userId" = roots."userId"
  AND (member."riskLineageRootId" IS NULL OR member."riskLineageRootId" = member."id")
  AND member."riskLineageRootId" IS DISTINCT FROM roots."rootId";
