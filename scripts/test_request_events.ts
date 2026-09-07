import { PrismaClient, RequestEventType } from '@prisma/client';
import {
  emitRequestEvent,
  generateIdempotencyKey,
  eventExists,
  getRequestEventHistory,
  replayRequestEvents,
} from '../src/lib/request-events-service.js';
import { createLogger } from '../src/lib/logger.js';

const prisma = new PrismaClient();
const log = createLogger('TestRequestEvents');

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function setupTestData() {
  for (let i = 1; i <= 12; i++) {
    const userId = `test-user-${i}`;
    const providerId = `test-provider-${i}`;
    
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `test${i}@test.com`,
        name: `Test User ${i}`,
        password: 'test-hash',
      },
      update: {},
    });

    await prisma.provider.upsert({
      where: { id: providerId },
      create: {
        id: providerId,
        displayName: `Test Provider ${i}`,
        slug: `test-provider-${i}`,
        category: 'Plomería',
        city: 'MANAGUA',
        userId,
      },
      update: {},
    });
  }
}

async function cleanupTestData() {
  await prisma.requestEvent.deleteMany({
    where: {
      requestId: {
        startsWith: 'test-thread-',
      },
    },
  });

  await prisma.quoteThread.deleteMany({
    where: {
      id: {
        startsWith: 'test-thread-',
      },
    },
  });

  for (let i = 1; i <= 12; i++) {
    const providerId = `test-provider-${i}`;
    const userId = `test-user-${i}`;
    
    await prisma.provider.deleteMany({
      where: { id: providerId },
    });

    await prisma.user.deleteMany({
      where: { id: userId },
    });
  }
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    log.info(`✅ ${name}`, { duration: `${duration}ms` });
  } catch (error) {
    const duration = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMessage, duration });
    log.error(`❌ ${name}`, { error: errorMessage, duration: `${duration}ms` });
  }
}

async function test1_emitBasicEvent() {
  const testThreadId = `test-thread-${Date.now()}-1`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-1',
      providerId: 'test-provider-1',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  const result = await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
    actorUserId: 'test-user-1',
    metadata: { source: 'test' },
  });

  if (!result.isNew) throw new Error('Expected new event');
  if (!result.id) throw new Error('Expected event ID');
  if (!result.idempotencyKey) throw new Error('Expected idempotency key');

  const event = await prisma.requestEvent.findUnique({
    where: { id: result.id },
  });

  if (!event) throw new Error('Event not found in database');
  if (event.requestId !== testThreadId) throw new Error('Request ID mismatch');
  if (event.eventType !== 'REQUEST_CREATED') throw new Error('Event type mismatch');
  if (event.actorUserId !== 'test-user-1') throw new Error('Actor user ID mismatch');
  
  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test2_idempotency() {
  const testThreadId = `test-thread-${Date.now()}-2`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-2',
      providerId: 'test-provider-2',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  const result1 = await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
    actorUserId: 'test-user-2',
    completionCycleNo: 0,
  });

  const result2 = await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
    actorUserId: 'test-user-2',
    completionCycleNo: 0,
  });

  if (result1.isNew !== true) throw new Error('First event should be new');
  if (result2.isNew !== false) throw new Error('Second event should not be new');
  if (result1.id !== result2.id) throw new Error('Should return same event ID');
  if (result1.idempotencyKey !== result2.idempotencyKey) throw new Error('Idempotency keys should match');

  const events = await prisma.requestEvent.findMany({
    where: { requestId: testThreadId },
  });

  if (events.length !== 1) throw new Error(`Expected 1 event, found ${events.length}`);

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test3_deterministicKeyGeneration() {
  const key1 = generateIdempotencyKey('req-1', 'REQUEST_CREATED', 'user-1', 0);
  const key2 = generateIdempotencyKey('req-1', 'REQUEST_CREATED', 'user-1', 0);
  const key3 = generateIdempotencyKey('req-1', 'REQUEST_CREATED', 'user-2', 0);
  const key4 = generateIdempotencyKey('req-1', 'PROVIDER_RESPONDED', 'user-1', 0);
  const key5 = generateIdempotencyKey('req-1', 'REQUEST_CREATED', 'user-1', 1);

  if (key1 !== key2) throw new Error('Keys should be deterministic');
  if (key1 === key3) throw new Error('Different actors should produce different keys');
  if (key1 === key4) throw new Error('Different event types should produce different keys');
  if (key1 === key5) throw new Error('Different cycle numbers should produce different keys');
  if (key1.length !== 64) throw new Error('SHA256 hash should be 64 characters');
}

async function test4_transactionRollback() {
  const testThreadId = `test-thread-${Date.now()}-4`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-4',
      providerId: 'test-provider-4',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  let transactionFailed = false;

  try {
    await prisma.$transaction(async (tx) => {
      await emitRequestEvent(prisma, {
        requestId: testThreadId,
        eventType: 'REQUEST_CREATED',
        actorUserId: 'test-user-4',
        tx,
      });

      throw new Error('Simulated transaction failure');
    });
  } catch (error) {
    transactionFailed = true;
  }

  if (!transactionFailed) throw new Error('Transaction should have failed');

  const events = await prisma.requestEvent.findMany({
    where: { requestId: testThreadId },
  });

  if (events.length !== 0) throw new Error('Event should have been rolled back');

  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test5_chronologicalOrdering() {
  const testThreadId = `test-thread-${Date.now()}-5`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-5',
      providerId: 'test-provider-5',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  const now = new Date();
  
  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
    occurredAt: new Date(now.getTime()),
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'PROVIDER_RESPONDED',
    occurredAt: new Date(now.getTime() + 1000),
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'QUOTE_ACCEPTED',
    occurredAt: new Date(now.getTime() + 2000),
  });

  const history = await getRequestEventHistory(prisma, { requestId: testThreadId });

  if (history.length !== 3) throw new Error(`Expected 3 events, found ${history.length}`);
  if (history[0].eventType !== 'REQUEST_CREATED') throw new Error('First event should be REQUEST_CREATED');
  if (history[1].eventType !== 'PROVIDER_RESPONDED') throw new Error('Second event should be PROVIDER_RESPONDED');
  if (history[2].eventType !== 'QUOTE_ACCEPTED') throw new Error('Third event should be QUOTE_ACCEPTED');

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test6_filterByEventType() {
  const testThreadId = `test-thread-${Date.now()}-6`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-6',
      providerId: 'test-provider-6',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'PROVIDER_RESPONDED',
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'PROVIDER_RESPONDED',
    completionCycleNo: 1,
  });

  const allEvents = await getRequestEventHistory(prisma, { requestId: testThreadId });
  const createdEvents = await getRequestEventHistory(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
  });
  const respondedEvents = await getRequestEventHistory(prisma, {
    requestId: testThreadId,
    eventType: 'PROVIDER_RESPONDED',
  });

  if (allEvents.length !== 3) throw new Error(`Expected 3 total events, found ${allEvents.length}`);
  if (createdEvents.length !== 1) throw new Error(`Expected 1 REQUEST_CREATED, found ${createdEvents.length}`);
  if (respondedEvents.length !== 2) throw new Error(`Expected 2 PROVIDER_RESPONDED, found ${respondedEvents.length}`);

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test7_flexibleMetadata() {
  const testThreadId = `test-thread-${Date.now()}-7`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-7',
      providerId: 'test-provider-7',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  const complexMetadata = {
    actor: 'requester',
    outcome: 'BILATERAL',
    nested: {
      level: 2,
      array: [1, 2, 3],
      flag: true,
    },
    timestamp: new Date().toISOString(),
  };

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'COMPLETION_CONFIRMED',
    metadata: complexMetadata,
  });

  const events = await prisma.requestEvent.findMany({
    where: { requestId: testThreadId },
  });

  if (events.length !== 1) throw new Error('Expected 1 event');
  
  const savedMetadata = events[0].metadataJson as Record<string, unknown>;
  if (!savedMetadata) throw new Error('Metadata should be saved');
  if (savedMetadata.actor !== 'requester') throw new Error('Actor mismatch');
  if (savedMetadata.outcome !== 'BILATERAL') throw new Error('Outcome mismatch');
  
  const nested = savedMetadata.nested as Record<string, unknown>;
  if (!nested || nested.level !== 2) throw new Error('Nested metadata mismatch');

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test8_nullableActor() {
  const testThreadId = `test-thread-${Date.now()}-8`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-8',
      providerId: 'test-provider-8',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'COMPLETION_TIMEOUT',
    metadata: { outcome: 'UNILATERAL_PROVIDER_CONFIRMED' },
  });

  const events = await prisma.requestEvent.findMany({
    where: { requestId: testThreadId },
  });

  if (events.length !== 1) throw new Error('Expected 1 event');
  if (events[0].actorUserId !== null) throw new Error('Actor should be null for system events');

  const keyWithoutActor = generateIdempotencyKey(testThreadId, 'COMPLETION_TIMEOUT', undefined, 0);
  
  if (events[0].idempotencyKey !== keyWithoutActor) {
    throw new Error('Idempotency key should handle null actor');
  }

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test9_completeEnum() {
  const allEventTypes: RequestEventType[] = [
    'REQUEST_CREATED',
    'PROVIDER_RESPONDED',
    'QUOTE_ACCEPTED',
    'COMPLETION_REQUESTED',
    'COMPLETION_CONFIRMED',
    'COMPLETION_TIMEOUT',
    'CANCELLED_BY_REQUESTER',
    'CANCELLED_BY_PROVIDER',
    'MODERATION_FLAG',
    'MODERATION_CLOSURE',
    'REOPENED',
    'MESSAGE_SENT',
    'DEADLINE_EXTENDED',
    'ADMIN_OVERRIDE',
  ];

  const testThreadId = `test-thread-${Date.now()}-9`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-9',
      providerId: 'test-provider-9',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  for (let i = 0; i < allEventTypes.length; i++) {
    await emitRequestEvent(prisma, {
      requestId: testThreadId,
      eventType: allEventTypes[i],
      completionCycleNo: i,
    });
  }

  const events = await prisma.requestEvent.findMany({
    where: { requestId: testThreadId },
  });

  if (events.length !== allEventTypes.length) {
    throw new Error(`Expected ${allEventTypes.length} events, found ${events.length}`);
  }

  const eventTypesFound = new Set(events.map(e => e.eventType));
  for (const eventType of allEventTypes) {
    if (!eventTypesFound.has(eventType)) {
      throw new Error(`Event type ${eventType} not found`);
    }
  }

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test10_efficientIndices() {
  const testThreadId = `test-thread-${Date.now()}-10`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-10',
      providerId: 'test-provider-10',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  for (let i = 0; i < 50; i++) {
    await emitRequestEvent(prisma, {
      requestId: testThreadId,
      eventType: 'MESSAGE_SENT',
      completionCycleNo: i,
      occurredAt: new Date(Date.now() + i * 1000),
    });
  }

  const queryStart = Date.now();
  const events = await getRequestEventHistory(prisma, {
    requestId: testThreadId,
    eventType: 'MESSAGE_SENT',
  });
  const queryDuration = Date.now() - queryStart;

  if (events.length !== 50) throw new Error(`Expected 50 events, found ${events.length}`);
  if (queryDuration > 100) {
    log.warn('Query took longer than expected', { duration: queryDuration });
  }

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test11_replayEvents() {
  const testThreadId = `test-thread-${Date.now()}-11`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-11',
      providerId: 'test-provider-11',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'COMPLETION_REQUESTED',
    actorUserId: 'test-user-11',
    completionCycleNo: 1,
    metadata: { actor: 'requester' },
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'COMPLETION_REQUESTED',
    actorUserId: 'test-user-11',
    completionCycleNo: 2,
    metadata: { actor: 'provider' },
  });

  await emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'COMPLETION_CONFIRMED',
    completionCycleNo: 1,
  });

  const state = await replayRequestEvents(prisma, testThreadId);

  if (state.workflow_phase !== 'CLOSED') throw new Error('Phase should be CLOSED');
  if (state.closure_outcome !== 'BILATERAL') throw new Error('Outcome should be BILATERAL');
  if (state.cycleNo !== 2) throw new Error('Cycle number should be 2');
  if (!state.confirmedByRequesterAt) throw new Error('Should have requester confirmation');
  if (!state.confirmedByProviderAt) throw new Error('Should have provider confirmation');
  if (!state.completedAt) throw new Error('Should have completion timestamp');

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function test12_raceConditionPrevention() {
  const testThreadId = `test-thread-${Date.now()}-12`;
  
  await prisma.quoteThread.create({
    data: {
      id: testThreadId,
      senderId: 'test-user-12',
      providerId: 'test-provider-12',
      subject: 'Test service',
      workflow_phase: 'OPEN',
      version: 1,
      cycleNo: 0,
    },
  });

  const idempotencyKey = generateIdempotencyKey(
    testThreadId,
    'REQUEST_CREATED',
    'test-user-12',
    0
  );

  const promise1 = emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
    actorUserId: 'test-user-12',
  });

  const promise2 = emitRequestEvent(prisma, {
    requestId: testThreadId,
    eventType: 'REQUEST_CREATED',
    actorUserId: 'test-user-12',
  });

  try {
    const [result1, result2] = await Promise.all([promise1, promise2]);

    if (result1.id !== result2.id) throw new Error('Both promises should return same event');
    if (result1.idempotencyKey !== result2.idempotencyKey) throw new Error('Idempotency keys should match');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      await Promise.allSettled([promise1, promise2]);
    } else {
      throw error;
    }
  }

  const events = await prisma.requestEvent.findMany({
    where: { requestId: testThreadId },
  });

  if (events.length !== 1) throw new Error(`Expected 1 event despite race, found ${events.length}`);

  const exists = await eventExists(prisma, idempotencyKey);
  if (!exists) throw new Error('Event should exist');

  await prisma.requestEvent.deleteMany({ where: { requestId: testThreadId } });
  await prisma.quoteThread.delete({ where: { id: testThreadId } });
}

async function main() {
  log.info('Starting RequestEvent tests', { timestamp: new Date().toISOString() });

  log.info('Setting up test data...');
  await setupTestData();

  await runTest('Test 1: Emitir evento básico', test1_emitBasicEvent);
  await runTest('Test 2: Idempotencia (duplicado retorna existente)', test2_idempotency);
  await runTest('Test 3: Generación determinista de keys', test3_deterministicKeyGeneration);
  await runTest('Test 4: Transacción atómica (rollback si falla)', test4_transactionRollback);
  await runTest('Test 5: Historial ordenado cronológicamente', test5_chronologicalOrdering);
  await runTest('Test 6: Filtrado por tipo de evento', test6_filterByEventType);
  await runTest('Test 7: Metadata JSON flexible', test7_flexibleMetadata);
  await runTest('Test 8: Actor nullable (eventos sistema)', test8_nullableActor);
  await runTest('Test 9: Enum completo (14 tipos)', test9_completeEnum);
  await runTest('Test 10: Índices eficientes (query rápida)', test10_efficientIndices);
  await runTest('Test 11: Replay de eventos (rebuild estado)', test11_replayEvents);
  await runTest('Test 12: Race condition prevention (UNIQUE constraint)', test12_raceConditionPrevention);

  log.info('Cleaning up test data...');
  await cleanupTestData();

  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = results.filter(r => !r.passed);

  console.log('\n' + '='.repeat(60));
  console.log(`RequestEvent Tests: ${passedTests}/${totalTests} passed`);
  console.log('='.repeat(60));

  if (failedTests.length > 0) {
    console.log('\nFailed tests:');
    failedTests.forEach(test => {
      console.log(`  ❌ ${test.name}`);
      console.log(`     Error: ${test.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main()
  .catch((error) => {
    log.error('Test suite failed', { error: error.message });
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
