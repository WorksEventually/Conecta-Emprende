import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { recalculateProviderTrustScore } from "../src/lib/trust-score-service";
import { TRUST_SCORE_ALGORITHM_VERSION } from "../src/domain/rating/calculateTrustScoreV2";

const apiUrl = process.env.API_URL ?? "http://localhost:3000";
const provider = await prisma.provider.findFirst({
  where: { status: "ACTIVE" },
  select: { id: true },
  orderBy: { id: "asc" },
});

assert.ok(provider, "Debe existir un proveedor no borrador para el contrato");

const recalculated = await recalculateProviderTrustScore(provider.id);
assert.equal(recalculated.algorithm_version, TRUST_SCORE_ALGORITHM_VERSION);

const metrics = await prisma.providerMetrics.findUnique({ where: { providerId: provider.id } });
assert.ok(metrics, "ProviderMetrics debe existir después del recálculo");
assert.equal(metrics.algorithmVersion, TRUST_SCORE_ALGORITHM_VERSION);
assert.equal(metrics.evidenceLevel, recalculated.evidence_level);
assert.equal(metrics.publicTrustScore, recalculated.public_score);

const snapshot = await prisma.trustScoreSnapshot.findFirst({
  where: { providerId: provider.id, algorithmVersion: TRUST_SCORE_ALGORITHM_VERSION },
  orderBy: { calculatedAt: "desc" },
});
assert.ok(snapshot, "Debe existir un snapshot versionado");
assert.equal(snapshot.publicScore, recalculated.public_score);
assert.equal(snapshot.evidenceLevel, recalculated.evidence_level);
assert.ok(snapshot.breakdown && typeof snapshot.breakdown === "object");
assert.ok(snapshot.caps && typeof snapshot.caps === "object");

const response = await fetch(`${apiUrl}/api/providers/${encodeURIComponent(provider.id)}/trust-score`);
assert.equal(response.status, 200);
const payload = await response.json() as { success: boolean; data: Record<string, unknown> };
assert.equal(payload.success, true);
assert.equal(payload.data.publicScore, recalculated.public_score);
assert.equal(payload.data.evidenceLevel, recalculated.evidence_level);
assert.equal(payload.data.algorithmVersion, TRUST_SCORE_ALGORITHM_VERSION);
assert.equal("internalScore" in payload.data, false, "El endpoint público no debe filtrar internalScore");

await prisma.$disconnect();
console.log("SPRINT8_TRUST_CONTRACT_OK");
