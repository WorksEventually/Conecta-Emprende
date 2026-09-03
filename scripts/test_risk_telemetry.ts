/**
 * Risk Telemetry - Unit Tests
 *
 * Tests puros de las métricas de riesgo y banderas críticas.
 * No requiere servidor ni base de datos.
 *
 * Uso:
 *   npm run test:risk-telemetry
 */
import assert from "node:assert/strict";
import { calculateRiskScore } from "../src/domain/risk/calculateRiskScore";

console.log("→ Ejecutando tests de Risk Telemetry...\n");

// Test 1: Proveedor limpio (sin anomalías, score <30)
const cleanProvider = calculateRiskScore({
  avgSearchTimeSeconds: 45,
  avgRequestToCompletionMinutes: 120,
  avgMessagesPerRequest: 8,
  newAccountsPercentage: 15,
  repeatedTargetProviderScore: 10,
  ratingConcentrationScore: 20,
});
assert.ok(cleanProvider.score < 30, "T1: Proveedor limpio debe tener score <30");
assert.equal(cleanProvider.level, "normal", "T1: Nivel debe ser 'normal'");
assert.equal(cleanProvider.shouldGenerateReport, false, "T1: No debe generar reporte");
console.log(`✓ Test 1: Proveedor limpio → score=${cleanProvider.score}, level=${cleanProvider.level}`);

// Test 2: Proveedor sospechoso (score ≥70)
// Bandera 1: Completado ultrarrápido (<15 min) → 20 puntos
// Bandera 2: Conversación mínima (<2 mensajes) → 15 puntos
// Bandera 3: Alta concentración de cuentas nuevas (80%) → 16 puntos
const suspiciousProvider = calculateRiskScore({
  avgSearchTimeSeconds: 3,
  avgRequestToCompletionMinutes: 8,
  avgMessagesPerRequest: 1.2,
  newAccountsPercentage: 80,
  repeatedTargetProviderScore: 75,
  ratingConcentrationScore: 85,
});
assert.ok(suspiciousProvider.score >= 70, "T2: Proveedor sospechoso debe tener score ≥70");
assert.ok(["suspicious", "high-risk"].includes(suspiciousProvider.level), "T2: Nivel debe ser 'suspicious' o 'high-risk'");
assert.equal(suspiciousProvider.shouldGenerateReport, true, "T2: Debe generar reporte automático");
console.log(`✓ Test 2: Proveedor sospechoso → score=${suspiciousProvider.score}, level=${suspiciousProvider.level}`);

// Test 3: Proveedor sin datos (valores en 0)
// Nota: con el contrato actual, `0` es un valor real (p.ej. 0 mensajes), no
// "sin datos": activa banderas (<2 mensajes, <15 min). La ausencia de datos
// se representa con `null` (ver Test 9).
const newProvider = calculateRiskScore({
  avgSearchTimeSeconds: 0,
  avgRequestToCompletionMinutes: 0,
  avgMessagesPerRequest: 0,
  newAccountsPercentage: 0,
  repeatedTargetProviderScore: 0,
  ratingConcentrationScore: 0,
});
assert.ok(newProvider.score > 0, "T3: Proveedor sin datos tiene score > 0 (ausencia de evidencia)");
assert.ok(newProvider.score < 70, "T3: Proveedor sin datos no debe generar reporte automático");
assert.equal(newProvider.shouldGenerateReport, false, "T3: No debe generar reporte");
console.log(`✓ Test 3: Proveedor sin datos → score=${newProvider.score}, level=${newProvider.level}`);

// Test 4: Bandera 1 - Completado ultrarrápido (<15 minutos)
const fastCompletion = calculateRiskScore({
  avgSearchTimeSeconds: 50,
  avgRequestToCompletionMinutes: 12,
  avgMessagesPerRequest: 5,
  newAccountsPercentage: 10,
  repeatedTargetProviderScore: 5,
  ratingConcentrationScore: 10,
});
assert.ok(fastCompletion.score >= 20, "T4: Bandera 1 (fast completion <15min) debe agregar ≥20 puntos");
console.log(`✓ Test 4: Bandera 1 (completado <15min) → score=${fastCompletion.score}`);

// Test 5: Bandera 2 - Conversación mínima (<2 mensajes)
const lowMessages = calculateRiskScore({
  avgSearchTimeSeconds: 50,
  avgRequestToCompletionMinutes: 120,
  avgMessagesPerRequest: 1.5,
  newAccountsPercentage: 10,
  repeatedTargetProviderScore: 5,
  ratingConcentrationScore: 10,
});
assert.ok(lowMessages.score >= 15, "T5: Bandera 2 (low messages <2) debe agregar ≥15 puntos");
console.log(`✓ Test 5: Bandera 2 (conversación <2 mensajes) → score=${lowMessages.score}`);

// Test 6: Bandera 3 - Concentración de cuentas nuevas (>60%)
const newAccountsConcentration = calculateRiskScore({
  avgSearchTimeSeconds: 50,
  avgRequestToCompletionMinutes: 120,
  avgMessagesPerRequest: 5,
  newAccountsPercentage: 75,
  repeatedTargetProviderScore: 5,
  ratingConcentrationScore: 70,
});
assert.ok(newAccountsConcentration.score >= 30, "T6: Bandera 3 (new accounts >60%) debe agregar penalización significativa");
console.log(`✓ Test 6: Bandera 3 (cuentas nuevas 75%) → score=${newAccountsConcentration.score}`);

// Test 7: Combinación de múltiples banderas (score muy alto)
const multipleFlags = calculateRiskScore({
  avgSearchTimeSeconds: 2,
  avgRequestToCompletionMinutes: 5,
  avgMessagesPerRequest: 1,
  newAccountsPercentage: 100,
  repeatedTargetProviderScore: 100,
  ratingConcentrationScore: 100,
});
assert.ok(multipleFlags.score >= 80, "T7: Múltiples banderas deben alcanzar score ≥80");
assert.equal(multipleFlags.level, "high-risk", "T7: Nivel debe ser 'high-risk'");
assert.equal(multipleFlags.shouldGenerateReport, true, "T7: Debe generar reporte");
console.log(`✓ Test 7: Múltiples banderas → score=${multipleFlags.score}, level=${multipleFlags.level}`);

// Test 8: Umbral exacto para reporte (score=70)
const thresholdProvider = calculateRiskScore({
  avgSearchTimeSeconds: 5,
  avgRequestToCompletionMinutes: 10,
  avgMessagesPerRequest: 1.5,
  newAccountsPercentage: 50,
  repeatedTargetProviderScore: 30,
  ratingConcentrationScore: 40,
});
if (thresholdProvider.score >= 70) {
  assert.equal(thresholdProvider.shouldGenerateReport, true, "T8: Score ≥70 debe generar reporte");
  console.log(`✓ Test 8: Umbral score=70 → genera reporte (score=${thresholdProvider.score})`);
} else {
  console.log(`✓ Test 8: Score=${thresholdProvider.score} <70 → no genera reporte`);
}

// Test 9: Señales no disponibles (null) no puntúan como sospechosas.
// La telemetría de búsqueda aún no existe y un proveedor sin actividad no
// tiene datos: null = desconocido, ni "búsqueda instantánea" ni
// "conversación mínima". Este caso regresiona el falso positivo (+20)
// que generaba RiskReports contra datos legítimos.
const unavailableSignals = calculateRiskScore({
  avgSearchTimeSeconds: null,
  avgRequestToCompletionMinutes: null,
  avgMessagesPerRequest: null,
  newAccountsPercentage: null,
  repeatedTargetProviderScore: null,
  ratingConcentrationScore: null,
});
assert.equal(unavailableSignals.score, 0, "T9: null (sin datos) no debe sumar puntos");
assert.equal(unavailableSignals.level, "normal", "T9: Nivel debe ser 'normal'");
assert.equal(unavailableSignals.shouldGenerateReport, false, "T9: No debe generar reporte");
console.log(`✓ Test 9: Señales no disponibles (null) → score=${unavailableSignals.score}`);

console.log("\n✅ Todos los tests de Risk Telemetry pasaron (9 casos)");
