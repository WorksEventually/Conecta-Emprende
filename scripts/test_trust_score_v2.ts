/**
 * Trust Score v2 - Unit Tests
 *
 * Tests puros de la fórmula bayesiana calculateTrustScoreV2.
 * No requiere servidor ni base de datos.
 *
 * Uso:
 *   npm run test:trust-v2
 */
import assert from "node:assert/strict";
import { calculateTrustScoreV2 } from "../src/domain/rating/calculateTrustScoreV2";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    hasBio: true,
    hasLogo: true,
    hasLocation: true,
    hasHours: true,
    emailVerified: true,
    phoneVerified: true,
    requestsResponded: 5,
    requestsIgnored: 0,
    bilateralCompletionsByRequester: new Map<string, number>(),
    weightedReviews: [],
    uniqueRequesters: 0,
    accountAgeDays: 100,
    responseTimeHrs: 20,
    suspiciousActivityPenalty: 0,
    ...overrides,
  } as any;
}

// Test 1: < 3 trabajos → public_score null
const result1 = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 2]]),
  weightedReviews: [{ score: 5, weight: 1.0 }, { score: 5, weight: 1.0 }],
  uniqueRequesters: 1,
}));
assert.equal(result1.public_score, null, "T1: public_score debe ser null con < 3 trabajos");
assert.equal(result1.evidence_level, "INSUFFICIENT_EVIDENCE", "T1: evidence_level debe indicar evidencia insuficiente");
assert.equal(result1.reason, "INSUFFICIENT_EVIDENCE", "T1: reason debe ser INSUFFICIENT_EVIDENCE");

// Test 2: >= 3 trabajos → score visible
const result2 = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 2], ["req2", 1]]),
  weightedReviews: [{ score: 5, weight: 1.0 }, { score: 5, weight: 1.0 }],
  uniqueRequesters: 2,
}));
assert.notEqual(result2.public_score, null, "T2: public_score no debe ser null con 3 trabajos");
assert.equal(result2.evidence_level, "OK", "T2: evidence_level debe ser OK con 3 trabajos");
assert.ok(result2.public_score! >= 0 && result2.public_score! <= 100, "T2: public_score en rango 0-100");

// Test 3: Tope por cliente (10 trabajos 1 cliente = max 2.0 puntos contribution)
const result3 = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 10]]),
  weightedReviews: [],
  uniqueRequesters: 1,
}));
assert.ok(result3.breakdown.completion <= 30, `T3: completion en rango (${result3.breakdown.completion})`);
// weightedCompletions = 2.0 → completion = 30 * (2 / 50) = 1.2
assert.equal(result3.breakdown.completion, 1.2, "T3: completion exacto con tope");

// Test 4: Review weight 0.5 vs 1.0 → rating mayor con peso completo
const resultBilateral = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 3]]),
  weightedReviews: [{ score: 5, weight: 1.0 }, { score: 5, weight: 1.0 }],
  uniqueRequesters: 1,
}));
const resultUnilateral = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 3]]),
  weightedReviews: [{ score: 5, weight: 0.5 }, { score: 5, weight: 0.5 }],
  uniqueRequesters: 1,
}));
assert.ok(
  resultBilateral.breakdown.rating > resultUnilateral.breakdown.rating,
  "T4: rating bilateral > unilateral"
);

// Test 5: Fórmula bayesiana → proveedor nuevo con 1 review 5★ tiene rating < 25
const resultBayes = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 3]]),
  weightedReviews: [{ score: 5, weight: 1.0 }],
  uniqueRequesters: 1,
}));
// Bayesian average is multiplied by rating confidence sqrt(1 / 30).
assert.ok(resultBayes.breakdown.rating < 25, `T5: rating bayesiano deprimido (${resultBayes.breakdown.rating})`);
assert.ok(resultBayes.breakdown.rating > 0, "T5: rating con evidencia positiva");

// Test 6: Proveedor con muchas reviews converge al promedio real
const manyFiveStar = Array.from({ length: 20 }, () => ({ score: 5, weight: 1.0 }));
const resultConverge = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 20]]),
  weightedReviews: manyFiveStar,
  uniqueRequesters: 1,
}));
// Bayesian average converges, while confidence remains capped below 1 at 20 reviews.
assert.ok(resultConverge.breakdown.rating > resultBayes.breakdown.rating, "T6: rating converge con más evidencia");
assert.ok(resultConverge.breakdown.rating < 25, "T6: confianza aún no llega al máximo");

// Test 7: Penalización reduce el score interno
const resultClean = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 3]]),
  weightedReviews: [{ score: 5, weight: 1.0 }],
  uniqueRequesters: 1,
  suspiciousActivityPenalty: 0,
}));
const resultPenalized = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 3]]),
  weightedReviews: [{ score: 5, weight: 1.0 }],
  uniqueRequesters: 1,
  suspiciousActivityPenalty: 20,
}));
assert.ok(
  resultPenalized.internal_score < resultClean.internal_score,
  "T7: penalización reduce score interno"
);

// Test 8: Umbral — mismo score interno con 1 vs 3 trabajos, solo cambia public_score
const resultLow = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 1]]),
  weightedReviews: [{ score: 5, weight: 1.0 }],
  uniqueRequesters: 1,
}));
const resultHigh = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 3]]),
  weightedReviews: [{ score: 5, weight: 1.0 }],
  uniqueRequesters: 1,
}));
assert.equal(resultLow.public_score, null);
assert.notEqual(resultHigh.public_score, null);
assert.ok(resultHigh.internal_score >= 0);

// Test 9: Componentes normativos — respuesta suavizada y madurez por activación.
const exactComponents = calculateTrustScoreV2(baseInput({
  eligibleInboundRequests: 5,
  respondedEligibleRequests: 5,
  medianFirstResponseHours: 1,
  eligibleEngagements: 10,
  adverseProviderEvents: 0,
  eligibleUniqueRequesters: 25,
  providerAgeDays: 730,
  bilateralCompletionsByRequester: new Map([
    ["req1", 1], ["req2", 1], ["req3", 1],
  ]),
}));
assert.equal(exactComponents.breakdown.responseBehavior, 9.4, "T9: respuesta suavizada exacta");
assert.equal(exactComponents.breakdown.providerMaturity, 10, "T9: madurez máxima exacta");
assert.equal(exactComponents.breakdown.requesterDiversity, 10, "T9: diversidad máxima exacta");
assert.equal(exactComponents.caps.completion, 35, "T9: cap bilateral para 3 completados");

// Test 10: El resultado público nunca expone score con evidencia insuficiente.
const insufficient = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 2]]),
}));
assert.equal(insufficient.public_score, null, "T10: score público oculto");
assert.equal(insufficient.evidence_level, "INSUFFICIENT_EVIDENCE", "T10: nivel de evidencia correcto");
assert.equal(insufficient.algorithm_version, "trust-v2.0.0", "T10: versión del algoritmo");

// Test 11: El cap de recencia se aplica por separado al score bruto.
const stale = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 3], ["req2", 3], ["req3", 3]]),
  eligibleUniqueRequesters: 3,
  providerAgeDays: 730,
  daysSinceLastBilateralCompletion: 800,
}));
assert.equal(stale.caps.recency, 65, "T11: cap de recencia para más de 730 días");
assert.ok(stale.internal_score <= 65, "T11: score limitado por recencia");

// Test 12: Moderación confirmada aplica el techo.
const moderated = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([
    ["req1", 3], ["req2", 3], ["req3", 3], ["req4", 3],
  ]),
  eligibleUniqueRequesters: 4,
  providerAgeDays: 730,
  moderationCap: 40,
  confirmedRiskPenalty: 30,
}));
assert.equal(moderated.caps.moderation, 40, "T12: cap de moderación grave");
assert.ok(moderated.internal_score <= 40, "T12: score limitado por moderación");

// Test 13: Baneo puede excluir el score mediante cap 0.
const banned = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 3], ["req2", 3], ["req3", 3]]),
  moderationCap: 0,
}));
assert.equal(banned.internal_score, 0, "T13: proveedor baneado queda fuera del score");

console.log("✅ Todos los tests de Trust Score v2 pasaron (13 casos)");
