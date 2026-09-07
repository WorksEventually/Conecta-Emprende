import { prisma } from "../src/lib/db";
import {
  recalculateProviderTrustScore,
} from "../src/lib/trust-score-service";
import { TRUST_SCORE_ALGORITHM_VERSION } from "../src/domain/rating/calculateTrustScoreV2";

const dryRun = process.argv.includes("--dry-run");
const requestedVersion = process.argv.find((arg) => arg.startsWith("--version="))?.split("=")[1];

if (requestedVersion && requestedVersion !== TRUST_SCORE_ALGORITHM_VERSION) {
  throw new Error(`Unsupported trust score algorithm version: ${requestedVersion}`);
}

const providers = await prisma.provider.findMany({
  select: { id: true, displayName: true },
  orderBy: { id: "asc" },
});

let recalculated = 0;
for (const provider of providers) {
  if (dryRun) {
    console.log(`[dry-run] ${provider.id} ${provider.displayName}`);
    continue;
  }

  const result = await recalculateProviderTrustScore(provider.id);
  recalculated += 1;
  console.log(
    `${provider.id} ${provider.displayName}: public=${result.public_score ?? "INSUFFICIENT_EVIDENCE"} internal=${result.internal_score} level=${result.evidence_level} version=${result.algorithm_version}`
  );
}

console.log(`${dryRun ? "Would rebuild" : "Rebuilt"} ${dryRun ? providers.length : recalculated} provider trust scores with ${TRUST_SCORE_ALGORITHM_VERSION}`);
await prisma.$disconnect();
