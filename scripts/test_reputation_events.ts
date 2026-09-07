import { PrismaClient } from '@prisma/client';
import {
  createReputationEvidence,
  invalidateEvidence,
  getActiveEvidence,
  calculateEvidenceWeights,
  rebuildTrustScoreFromEvents,
} from '../src/lib/reputation-events-service.js';

const prisma = new PrismaClient();

let testProviderId: string;
let testRequestId1: string;
let testRequestId2: string;
let testUserId: string;

async function setupTestData() {
  const user = await prisma.user.create({
    data: {
      email: `test-rep-${Date.now()}@test.local`,
      password: 'hashed',
      name: 'Test Reputation User',
    },
  });
  testUserId = user.id;

  const provider = await prisma.provider.create({
    data: {
      userId: user.id,
      displayName: 'Test Reputation Provider',
      slug: `test-rep-provider-${Date.now()}`,
      category: 'Desarrollo de Software',
      city: 'MANAGUA',
      status: 'ACTIVE',
    },
  });
  testProviderId = provider.id;

  const sender = await prisma.user.create({
    data: {
      email: `test-sender-${Date.now()}@test.local`,
      password: 'hashed',
      name: 'Test Sender',
    },
  });

  const thread1 = await prisma.quoteThread.create({
    data: {
      providerId: testProviderId,
      senderId: sender.id,
      subject: 'Test Thread 1',
      workflow_phase: 'CLOSED',
      closure_outcome: 'BILATERAL',
    },
  });
  testRequestId1 = thread1.id;

  const thread2 = await prisma.quoteThread.create({
    data: {
      providerId: testProviderId,
      senderId: sender.id,
      subject: 'Test Thread 2',
      workflow_phase: 'CLOSED',
      closure_outcome: 'BILATERAL',
    },
  });
  testRequestId2 = thread2.id;

  console.log('✅ Test data setup complete');
}

async function cleanupTestData() {
  await prisma.reputationEvent.deleteMany({
    where: { providerId: testProviderId },
  });

  await prisma.quoteThread.deleteMany({
    where: { providerId: testProviderId },
  });

  await prisma.provider.deleteMany({
    where: { id: testProviderId },
  });

  await prisma.user.deleteMany({
    where: { id: testUserId },
  });

  console.log('✅ Test data cleanup complete');
}

async function test1_createBasicEvidence() {
  console.log('\n📝 Test 1: Crear evidencia básica');

  const result = await createReputationEvidence(prisma, {
    providerId: testProviderId,
    requestId: testRequestId1,
    evidenceType: 'BILATERAL_COMPLETION',
    evidenceWeight: 1.0,
  });

  if (!result.id || !result.isNew) {
    throw new Error('Failed to create evidence');
  }

  console.log('✅ Test 1 passed');
}

async function test2_idempotency() {
  console.log('\n📝 Test 2: Idempotencia (UNIQUE constraint requestId + evidenceType)');

  const result1 = await createReputationEvidence(prisma, {
    providerId: testProviderId,
    requestId: testRequestId1,
    evidenceType: 'BILATERAL_COMPLETION',
    evidenceWeight: 1.0,
  });

  const result2 = await createReputationEvidence(prisma, {
    providerId: testProviderId,
    requestId: testRequestId1,
    evidenceType: 'BILATERAL_COMPLETION',
    evidenceWeight: 1.0,
  });

  if (result2.isNew || result1.id !== result2.id) {
    throw new Error('Idempotency failed');
  }

  console.log('✅ Test 2 passed');
}

async function test3_multipleEvidenceTypes() {
  console.log('\n📝 Test 3: Múltiples tipos de evidencia para mismo request');

  const result1 = await createReputationEvidence(prisma, {
    providerId: testProviderId,
    requestId: testRequestId1,
    evidenceType: 'BILATERAL_COMPLETION',
    evidenceWeight: 1.0,
  });

  const result2 = await createReputationEvidence(prisma, {
    providerId: testProviderId,
    requestId: testRequestId1,
    evidenceType: 'UNILATERAL_REVIEW_QUALIFIED',
    evidenceWeight: 0.5,
  });

  if (!result1.id || !result2.id || result1.id === result2.id) {
    throw new Error('Multiple evidence types failed');
  }

  console.log('✅ Test 3 passed');
}

async function test4_invalidateEvidence() {
  console.log('\n📝 Test 4: Invalidar evidencia (soft delete)');

  const result = await createReputationEvidence(prisma, {
    providerId: testProviderId,
    requestId: testRequestId2,
    evidenceType: 'BILATERAL_COMPLETION',
    evidenceWeight: 1.0,
  });

  await invalidateEvidence(prisma, {
    evidenceId: result.id,
    invalidatedByAdminId: testUserId,
    invalidationReason: 'Test invalidation',
  });

  const evidence = await prisma.reputationEvent.findUnique({
    where: { id: result.id },
  });

  if (!evidence || !evidence.invalidatedAt || evidence.invalidationReason !== 'Test invalidation') {
    throw new Error('Invalidation failed');
  }

  console.log('✅ Test 4 passed');
}

async function test5_getActiveEvidence() {
  console.log('\n📝 Test 5: Filtrar solo evidencia activa (invalidatedAt = null)');

  const activeEvidence = await getActiveEvidence(prisma, {
    providerId: testProviderId,
    activeOnly: true,
  });

  const allEvidence = await getActiveEvidence(prisma, {
    providerId: testProviderId,
    activeOnly: false,
  });

  if (activeEvidence.length >= allEvidence.length) {
    throw new Error('Active filter failed');
  }

  console.log(`   Activas: ${activeEvidence.length} | Total: ${allEvidence.length}`);
  console.log('✅ Test 5 passed');
}

async function test6_filterByType() {
  console.log('\n📝 Test 6: Filtrar por tipo de evidencia');

  const bilateral = await getActiveEvidence(prisma, {
    providerId: testProviderId,
    evidenceType: 'BILATERAL_COMPLETION',
    activeOnly: true,
  });

  const reviews = await getActiveEvidence(prisma, {
    providerId: testProviderId,
    evidenceType: 'UNILATERAL_REVIEW_QUALIFIED',
    activeOnly: true,
  });

  if (bilateral.length === 0 || reviews.length === 0) {
    throw new Error('Filter by type failed');
  }

  console.log(`   BILATERAL_COMPLETION: ${bilateral.length} | UNILATERAL_REVIEW_QUALIFIED: ${reviews.length}`);
  console.log('✅ Test 6 passed');
}

async function test7_calculateWeights() {
  console.log('\n📝 Test 7: Calcular pesos totales por tipo');

  const weights = await calculateEvidenceWeights(prisma, testProviderId, true);

  if (!weights.totalWeight || !weights.byType || weights.count === 0) {
    throw new Error('Weight calculation failed');
  }

  console.log(`   Total weight: ${weights.totalWeight} | Count: ${weights.count}`);
  console.log('✅ Test 7 passed');
}

async function test8_rebuildFromEvents() {
  console.log('\n📝 Test 8: Rebuild trust score desde eventos');

  const scores = await rebuildTrustScoreFromEvents(prisma, testProviderId);

  if (
    scores.completionHistoryScore === undefined ||
    scores.ratingQualityScore === undefined ||
    scores.requesterDiversityScore === undefined
  ) {
    throw new Error('Rebuild from events failed');
  }

  console.log(`   Completion: ${scores.completionHistoryScore}`);
  console.log(`   Rating: ${scores.ratingQualityScore}`);
  console.log(`   Diversity: ${scores.requesterDiversityScore}`);
  console.log('✅ Test 8 passed');
}

async function test8b_unilateralDoesNotIncreaseDiversity() {
  console.log('\n📝 Test 8b: Reseña 0.5 no incrementa diversidad');
  const before = await rebuildTrustScoreFromEvents(prisma, testProviderId);
  await createReputationEvidence(prisma, {
    providerId: testProviderId,
    requestId: testRequestId1,
    evidenceType: 'UNILATERAL_REVIEW_QUALIFIED',
    evidenceWeight: 0.5,
  });
  const after = await rebuildTrustScoreFromEvents(prisma, testProviderId);
  if (
    after.requesterDiversityScore !== before.requesterDiversityScore ||
    after.completionHistoryScore !== before.completionHistoryScore
  ) {
    throw new Error('Unilateral evidence incorrectly changed completion maturity');
  }
  console.log('✅ Test 8b passed');
}

async function test9_evidenceWithoutRequest() {
  console.log('\n📝 Test 9: Evidencia sin requestId (ej. CONTACT_CONFIRMATION)');

  const result = await createReputationEvidence(prisma, {
    providerId: testProviderId,
    evidenceType: 'CONTACT_CONFIRMATION',
    evidenceWeight: 3.0,
  });

  if (!result.id || !result.isNew) {
    throw new Error('Evidence without request failed');
  }

  console.log('✅ Test 9 passed');
}

async function test10_uniqueConstraintViolation() {
  console.log('\n📝 Test 10: UNIQUE constraint en (requestId, evidenceType)');

  await createReputationEvidence(prisma, {
    providerId: testProviderId,
    requestId: testRequestId2,
    evidenceType: 'BILATERAL_COMPLETION',
    evidenceWeight: 1.0,
  });

  try {
    await prisma.reputationEvent.create({
      data: {
        providerId: testProviderId,
        requestId: testRequestId2,
        evidenceType: 'BILATERAL_COMPLETION',
        evidenceWeight: 1.0,
      },
    });
    throw new Error('Should have thrown unique constraint error');
  } catch (error: any) {
    if (!error.code || error.code !== 'P2002') {
      throw new Error('Expected unique constraint violation');
    }
  }

  console.log('✅ Test 10 passed');
}

async function runAllTests() {
  console.log('🧪 Iniciando Tests de ReputationEvents\n');

  try {
    await setupTestData();

    await test1_createBasicEvidence();
    await test2_idempotency();
    await test3_multipleEvidenceTypes();
    await test4_invalidateEvidence();
    await test5_getActiveEvidence();
    await test6_filterByType();
    await test7_calculateWeights();
    await test8_rebuildFromEvents();
    await test8b_unilateralDoesNotIncreaseDiversity();
    await test9_evidenceWithoutRequest();
    await test10_uniqueConstraintViolation();

    await cleanupTestData();

    console.log('\n✅ Todos los tests pasaron (11/11) ✅');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await cleanupTestData();
    process.exit(1);
  }
}

runAllTests()
  .then(() => {
    console.log('\n✅ Suite de tests completada exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en suite de tests:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
