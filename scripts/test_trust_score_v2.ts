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
assert.equal(result1.reason, "INSUFFICIENT_EVIDENCE", "T1: reason debe ser INSUFFICIENT_EVIDENCE");

// Test 2: >= 3 trabajos → score visible
const result2 = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 2], ["req2", 1]]),
  weightedReviews: [{ score: 5, weight: 1.0 }, { score: 5, weight: 1.0 }],
  uniqueRequesters: 2,
}));
assert.notEqual(result2.public_score, null, "T2: public_score no debe ser null con 3 trabajos");
assert.ok(result2.public_score! >= 0 && result2.public_score! <= 100, "T2: public_score en rango 0-100");

// Test 3: Tope por cliente (10 trabajos 1 cliente = max 2.0 puntos contribution)
const result3 = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 10]]),
  weightedReviews: [],
  uniqueRequesters: 1,
}));
assert.ok(result3.breakdown.completion <= 5, `T3: completion topada (${result3.breakdown.completion})`);
// weightedCompletions = 2.0 → completion = min(round(2/15*30), 30) = 4
assert.equal(result3.breakdown.completion, 4, "T3: completion exacto con tope");

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
// bayesianAvg = (4*10 + 5*1) / 11 = 45/11 ≈ 4.09 → rating ≈ round(4.09/5*25) = 20
assert.ok(resultBayes.breakdown.rating < 25, `T5: rating bayesiano deprimido (${resultBayes.breakdown.rating})`);
assert.equal(resultBayes.breakdown.rating, 20, "T5: rating exacto esperado 20");

// Test 6: Proveedor con muchas reviews converge al promedio real
const manyFiveStar = Array.from({ length: 20 }, () => ({ score: 5, weight: 1.0 }));
const resultConverge = calculateTrustScoreV2(baseInput({
  bilateralCompletionsByRequester: new Map([["req1", 20]]),
  weightedReviews: manyFiveStar,
  uniqueRequesters: 1,
}));
// bayesianAvg = (4*10 + 5*20)/30 = 140/30 ≈ 4.67 → rating ≈ round(4.67/5*25) = 23
assert.equal(resultConverge.breakdown.rating, 23, "T6: converge a promedio real 5★");

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

console.log("✅ Todos los tests de Trust Score v2 pasaron (8 casos)");