import { PrismaClient } from '@prisma/client';
import { createLogger } from '../src/lib/logger.js';
import { emitRequestEvent } from '../src/lib/request-events-service.js';

const prisma = new PrismaClient();
const log = createLogger('TestSprint6StateMachine');

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function setupTestData() {
  for (let i = 1; i <= 5; i++) {
    const userId = `test-s6-user-${i}`;
    const providerId = `test-s6-provider-${i}`;
    
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `tests6-${i}@test.com`,
        name: `Test S6 User ${i}`,
        password: 'test-hash',
      },
      update: {},
    });

    await prisma.provider.upsert({
      where: { id: providerId },
      create: {
        id: providerId,
        displayName: `Test S6 Provider ${i}`,
        slug: `test-s6-provider-${i}`,
        category: 'Electricidad',
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
        startsWith: 'test-s6-thread-',
      },
    },
  });

  await prisma.quoteMessage.deleteMany({
    where: {
      threadId: {
        startsWith: 'test-s6-thread-',
      },
    },
  });

  await prisma.quoteThread.deleteMany({
    where: {
      id: {
        startsWith: 'test-s6-thread-',
      },
    },
  });

  for (let i = 1; i <= 5; i++) {
    const providerId = `test-s6-provider-${i}`;
    const userId = `test-s6-user-${i}`;
    
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

async function test1_closureOutcomeBilateral() {
  const threadId = 'test-s6-thread-1';
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-1',
      providerId: 'test-s6-provider-1',
      subject: 'Test BILATERAL outcome',
      workflow_phase: 'CLOSED',
      closure_outcome: 'BILATERAL',
    },
  });

  if (thread.closure_outcome !== 'BILATERAL') {
    throw new Error(`Expected BILATERAL, got ${thread.closure_outcome}`);
  }
}

async function test2_closureOutcomeDeclinedByProvider() {
  const threadId = 'test-s6-thread-2';
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-2',
      providerId: 'test-s6-provider-2',
      subject: 'Test DECLINED_BY_PROVIDER outcome',
      workflow_phase: 'CLOSED',
      closure_outcome: 'DECLINED_BY_PROVIDER',
    },
  });

  if (thread.closure_outcome !== 'DECLINED_BY_PROVIDER') {
    throw new Error(`Expected DECLINED_BY_PROVIDER, got ${thread.closure_outcome}`);
  }
}

async function test3_closureOutcomeExpiredNoProviderResponse() {
  const threadId = 'test-s6-thread-3';
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-3',
      providerId: 'test-s6-provider-3',
      subject: 'Test EXPIRED_NO_PROVIDER_RESPONSE outcome',
      workflow_phase: 'CLOSED',
      closure_outcome: 'EXPIRED_NO_PROVIDER_RESPONSE',
    },
  });

  if (thread.closure_outcome !== 'EXPIRED_NO_PROVIDER_RESPONSE') {
    throw new Error(`Expected EXPIRED_NO_PROVIDER_RESPONSE, got ${thread.closure_outcome}`);
  }
}

async function test4_closureOutcomeAccountDeactivated() {
  const threadId = 'test-s6-thread-4';
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-4',
      providerId: 'test-s6-provider-4',
      subject: 'Test ACCOUNT_DEACTIVATED outcome',
      workflow_phase: 'CLOSED',
      closure_outcome: 'ACCOUNT_DEACTIVATED',
    },
  });

  if (thread.closure_outcome !== 'ACCOUNT_DEACTIVATED') {
    throw new Error(`Expected ACCOUNT_DEACTIVATED, got ${thread.closure_outcome}`);
  }
}

async function test5_closureOutcomeClosedByAdmin() {
  const threadId = 'test-s6-thread-5';
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-5',
      providerId: 'test-s6-provider-5',
      subject: 'Test CLOSED_BY_ADMIN outcome',
      workflow_phase: 'CLOSED',
      closure_outcome: 'CLOSED_BY_ADMIN',
    },
  });

  if (thread.closure_outcome !== 'CLOSED_BY_ADMIN') {
    throw new Error(`Expected CLOSED_BY_ADMIN, got ${thread.closure_outcome}`);
  }
}

async function test6_completionInitiatorUserIdField() {
  const threadId = 'test-s6-thread-6';
  const initiatorId = 'test-s6-user-1';
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-1',
      providerId: 'test-s6-provider-1',
      subject: 'Test completionInitiatorUserId field',
      workflow_phase: 'OPEN',
      completionInitiatorUserId: initiatorId,
    },
  });

  if (thread.completionInitiatorUserId !== initiatorId) {
    throw new Error(`Expected ${initiatorId}, got ${thread.completionInitiatorUserId}`);
  }
}

async function test7_completionRejectedAtField() {
  const threadId = 'test-s6-thread-7';
  const rejectedAt = new Date();
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-2',
      providerId: 'test-s6-provider-2',
      subject: 'Test completionRejectedAt field',
      workflow_phase: 'OPEN',
      completionRejectedAt: rejectedAt,
    },
  });

  if (!thread.completionRejectedAt) {
    throw new Error('completionRejectedAt should be set');
  }
}

async function test8_completionRejectedByUserIdField() {
  const threadId = 'test-s6-thread-8';
  const rejectorId = 'test-s6-user-3';
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-3',
      providerId: 'test-s6-provider-3',
      subject: 'Test completionRejectedByUserId field',
      workflow_phase: 'OPEN',
      completionRejectedByUserId: rejectorId,
    },
  });

  if (thread.completionRejectedByUserId !== rejectorId) {
    throw new Error(`Expected ${rejectorId}, got ${thread.completionRejectedByUserId}`);
  }
}

async function test9_lastNonSystemicMessageAtField() {
  const threadId = 'test-s6-thread-9';
  const messageAt = new Date();
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-4',
      providerId: 'test-s6-provider-4',
      subject: 'Test lastNonSystemicMessageAt field',
      workflow_phase: 'OPEN',
      lastNonSystemicMessageAt: messageAt,
    },
  });

  if (!thread.lastNonSystemicMessageAt) {
    throw new Error('lastNonSystemicMessageAt should be set');
  }
}

async function test10_eventCompletionNotAccepted() {
  const threadId = 'test-s6-thread-10';
  
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-5',
      providerId: 'test-s6-provider-5',
      subject: 'Test COMPLETION_NOT_ACCEPTED event',
      workflow_phase: 'OPEN',
    },
  });

  await emitRequestEvent(prisma, {
    requestId: threadId,
    eventType: 'COMPLETION_NOT_ACCEPTED',
    actorUserId: 'test-s6-user-5',
    metadata: { note: 'Todavía no está terminado' },
  });

  const events = await prisma.requestEvent.findMany({
    where: { requestId: threadId },
  });

  if (events.length === 0 || events[0].eventType !== 'COMPLETION_NOT_ACCEPTED') {
    throw new Error('COMPLETION_NOT_ACCEPTED event not emitted correctly');
  }
}

async function test11_eventCompletionRequestWithdrawn() {
  const threadId = 'test-s6-thread-11';
  
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-1',
      providerId: 'test-s6-provider-1',
      subject: 'Test COMPLETION_REQUEST_WITHDRAWN event',
      workflow_phase: 'OPEN',
    },
  });

  await emitRequestEvent(prisma, {
    requestId: threadId,
    eventType: 'COMPLETION_REQUEST_WITHDRAWN',
    actorUserId: 'test-s6-user-1',
    metadata: {},
  });

  const events = await prisma.requestEvent.findMany({
    where: { requestId: threadId },
  });

  if (events.length === 0 || events[0].eventType !== 'COMPLETION_REQUEST_WITHDRAWN') {
    throw new Error('COMPLETION_REQUEST_WITHDRAWN event not emitted correctly');
  }
}

async function test12_eventRequestDeclined() {
  const threadId = 'test-s6-thread-12';
  
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-2',
      providerId: 'test-s6-provider-2',
      subject: 'Test REQUEST_DECLINED event',
      workflow_phase: 'CLOSED',
      closure_outcome: 'DECLINED_BY_PROVIDER',
    },
  });

  await emitRequestEvent(prisma, {
    requestId: threadId,
    eventType: 'REQUEST_DECLINED',
    actorUserId: 'test-s6-user-2',
    metadata: { reason: 'No disponible' },
  });

  const events = await prisma.requestEvent.findMany({
    where: { requestId: threadId },
  });

  if (events.length === 0 || events[0].eventType !== 'REQUEST_DECLINED') {
    throw new Error('REQUEST_DECLINED event not emitted correctly');
  }
}

async function test13_eventRequestExpired() {
  const threadId = 'test-s6-thread-13';
  
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-3',
      providerId: 'test-s6-provider-3',
      subject: 'Test REQUEST_EXPIRED event',
      workflow_phase: 'CLOSED',
      closure_outcome: 'EXPIRED_NO_PROVIDER_RESPONSE',
    },
  });

  await emitRequestEvent(prisma, {
    requestId: threadId,
    eventType: 'REQUEST_EXPIRED',
    actorUserId: 'test-s6-user-3',
    metadata: {},
  });

  const events = await prisma.requestEvent.findMany({
    where: { requestId: threadId },
  });

  if (events.length === 0 || events[0].eventType !== 'REQUEST_EXPIRED') {
    throw new Error('REQUEST_EXPIRED event not emitted correctly');
  }
}

async function test14_closedThreadHasOutcome() {
  const threadId = 'test-s6-thread-14';
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: 'test-s6-user-4',
      providerId: 'test-s6-provider-4',
      subject: 'Test closed thread has outcome',
      workflow_phase: 'CLOSED',
      closure_outcome: 'BILATERAL',
    },
  });

  if (thread.workflow_phase !== 'CLOSED') {
    throw new Error(`Expected CLOSED, got ${thread.workflow_phase}`);
  }

  if (thread.closure_outcome === null) {
    throw new Error('Closed thread should have a closure_outcome');
  }
}

async function test15_allNineOutcomesExist() {
  const expectedOutcomes = [
    'BILATERAL',
    'REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE',
    'PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE',
    'CANCELLED_BY_REQUESTER',
    'CANCELLED_BY_PROVIDER',
    'DECLINED_BY_PROVIDER',
    'EXPIRED_NO_PROVIDER_RESPONSE',
    'ACCOUNT_DEACTIVATED',
    'CLOSED_BY_ADMIN',
  ];

  for (let i = 0; i < expectedOutcomes.length; i++) {
    const outcome = expectedOutcomes[i];
    const threadId = `test-s6-thread-all-${i}`;
    
    const thread = await prisma.quoteThread.create({
      data: {
        id: threadId,
        senderId: 'test-s6-user-5',
        providerId: 'test-s6-provider-5',
        subject: `Test outcome ${outcome}`,
        workflow_phase: 'CLOSED',
        closure_outcome: outcome as any,
      },
    });

    if (thread.closure_outcome !== outcome) {
      throw new Error(`Expected ${outcome}, got ${thread.closure_outcome}`);
    }

    await prisma.quoteThread.delete({ where: { id: threadId } });
  }
}

async function main() {
  log.info('🚀 Iniciando Test Suite Sprint 6 - Máquina de Estados Completa');

  try {
    log.info('📦 Preparando datos de prueba...');
    await setupTestData();

    log.info('🧪 Ejecutando tests...');
    
    log.info('═══ Grupo 1: Outcomes Completos (5 tests) ═══');
    await runTest('1. Outcome BILATERAL funciona', test1_closureOutcomeBilateral);
    await runTest('2. Outcome DECLINED_BY_PROVIDER funciona', test2_closureOutcomeDeclinedByProvider);
    await runTest('3. Outcome EXPIRED_NO_PROVIDER_RESPONSE funciona', test3_closureOutcomeExpiredNoProviderResponse);
    await runTest('4. Outcome ACCOUNT_DEACTIVATED funciona', test4_closureOutcomeAccountDeactivated);
    await runTest('5. Outcome CLOSED_BY_ADMIN funciona', test5_closureOutcomeClosedByAdmin);

    log.info('═══ Grupo 2: Campos Sprint 6 (4 tests) ═══');
    await runTest('6. Campo completionInitiatorUserId funciona', test6_completionInitiatorUserIdField);
    await runTest('7. Campo completionRejectedAt funciona', test7_completionRejectedAtField);
    await runTest('8. Campo completionRejectedByUserId funciona', test8_completionRejectedByUserIdField);
    await runTest('9. Campo lastNonSystemicMessageAt funciona', test9_lastNonSystemicMessageAtField);

    log.info('═══ Grupo 3: Eventos Sprint 6 (4 tests) ═══');
    await runTest('10. Evento COMPLETION_NOT_ACCEPTED se emite', test10_eventCompletionNotAccepted);
    await runTest('11. Evento COMPLETION_REQUEST_WITHDRAWN se emite', test11_eventCompletionRequestWithdrawn);
    await runTest('12. Evento REQUEST_DECLINED se emite', test12_eventRequestDeclined);
    await runTest('13. Evento REQUEST_EXPIRED se emite', test13_eventRequestExpired);

    log.info('═══ Grupo 4: Validación Final (2 tests) ═══');
    await runTest('14. Thread cerrado tiene closure_outcome', test14_closedThreadHasOutcome);
    await runTest('15. Los 9 outcomes existen y funcionan', test15_allNineOutcomesExist);

  } finally {
    log.info('🧹 Limpiando datos de prueba...');
    await cleanupTestData();
    await prisma.$disconnect();
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  log.info('');
  log.info('═══════════════════════════════════════════');
  log.info('📊 RESUMEN FINAL - Sprint 6 State Machine');
  log.info('═══════════════════════════════════════════');
  log.info(`✅ Pasados: ${passed}/${total}`);
  log.info(`❌ Fallidos: ${failed}/${total}`);

  if (failed > 0) {
    log.info('');
    log.info('❌ Tests fallidos:');
    results.filter(r => !r.passed).forEach(r => {
      log.error(`  - ${r.name}: ${r.error}`);
    });
  }

  log.info('═══════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  log.error('Error fatal en suite de tests', { error: error.message });
  process.exit(1);
});
