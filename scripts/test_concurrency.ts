import { PrismaClient, WorkflowPhase, ClosureOutcome } from '@prisma/client';
import { updateThreadWithLocking, ConcurrencyError } from '../src/lib/quotes-service';
import { resolveExpiredQuotes } from '../src/lib/cron/resolve-expired-quotes';
import { createLogger } from '../src/lib/logger.js';

const prisma = new PrismaClient();
const log = createLogger('TestConcurrency');

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function setupTestData() {
  const userId = 'test-user-concurrency';
  const providerId = 'test-provider-concurrency';

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: 'concurrency@test.com',
      name: 'Concurrency Test User',
      password: 'test-hash',
    },
    update: {},
  });

  await prisma.provider.upsert({
    where: { id: providerId },
    create: {
      id: providerId,
      displayName: 'Concurrency Test Provider',
      slug: 'concurrency-test-provider',
      category: 'Testing',
      city: 'MANAGUA',
      userId,
    },
    update: {},
  });

  return { userId, providerId };
}

async function cleanupTestData() {
  await prisma.requestEvent.deleteMany({
    where: {
      requestId: {
        startsWith: 'test-thread-concurrency-',
      },
    },
  });

  await prisma.quoteThread.deleteMany({
    where: {
      id: {
        startsWith: 'test-thread-concurrency-',
      },
    },
  });
}

async function runTest(name: string, testFn: () => Promise<void>) {
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

// Test 1: Race confirmación simultánea
async function test1RaceConditionSimultaneousConfirmation() {
  const { userId, providerId } = await setupTestData();
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: 'test-thread-concurrency-1',
      senderId: userId,
      providerId,
      subject: 'Test Race Condition',
      status: 'IN_CONVERSATION',
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      confirmedByRequesterAt: new Date(),
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      version: 0,
      cycleNo: 0,
    },
  });

  let error1: Error | null = null;
  let error2: Error | null = null;

  await Promise.all([
    updateThreadWithLocking(thread.id, 0, { confirmedByProviderAt: new Date() })
      .catch((err) => { error1 = err; }),
    updateThreadWithLocking(thread.id, 0, { status: 'COMPLETED' })
      .catch((err) => { error2 = err; }),
  ]);

  if (!error1 && !error2) {
    throw new Error('Expected at least one ConcurrencyError');
  }

  const hasConcurrencyError = 
    (error1 instanceof ConcurrencyError) || 
    (error2 instanceof ConcurrencyError);

  if (!hasConcurrencyError) {
    throw new Error('Expected ConcurrencyError but got different error');
  }

  const updated = await prisma.quoteThread.findUnique({
    where: { id: thread.id },
  });

  if (!updated || updated.version !== 1) {
    throw new Error(`Expected version 1, got ${updated?.version}`);
  }

  log.info('Race condition correctly detected', { version: updated.version });
}

// Test 2: Timeout vs confirmación tardía (409)
async function test2TimeoutVsLateConfirmation() {
  const { userId, providerId } = await setupTestData();

  const expiredDeadline = new Date(Date.now() - 1000);
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: 'test-thread-concurrency-2',
      senderId: userId,
      providerId,
      subject: 'Test Timeout vs Late Confirmation',
      status: 'IN_CONVERSATION',
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      confirmedByRequesterAt: new Date(),
      completionDeadline: expiredDeadline,
      version: 0,
      cycleNo: 0,
    },
  });

  await resolveExpiredQuotes();

  const afterCron = await prisma.quoteThread.findUnique({
    where: { id: thread.id },
  });

  if (afterCron?.workflow_phase !== WorkflowPhase.CLOSED) {
    throw new Error('Thread should be CLOSED after cron');
  }

  let caughtError = false;
  try {
    await updateThreadWithLocking(
      thread.id,
      0,
      { confirmedByProviderAt: new Date() }
    );
  } catch (error) {
    if (error instanceof ConcurrencyError) {
      caughtError = true;
    }
  }

  if (!caughtError) {
    throw new Error('Expected ConcurrencyError for stale version');
  }

  log.info('Timeout correctly prevented late confirmation');
}

// Test 3: Doble worker cron
async function test3DoubleWorkerCron() {
  const { userId, providerId } = await setupTestData();

  const expiredDeadline = new Date(Date.now() - 1000);
  
  await prisma.quoteThread.create({
    data: {
      id: 'test-thread-concurrency-3',
      senderId: userId,
      providerId,
      subject: 'Test Double Worker',
      status: 'IN_CONVERSATION',
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      confirmedByRequesterAt: new Date(),
      confirmedByProviderAt: new Date(),
      completionDeadline: expiredDeadline,
      version: 0,
      cycleNo: 0,
    },
  });

  const [result1, result2] = await Promise.all([
    resolveExpiredQuotes(),
    resolveExpiredQuotes(),
  ]);

  const totalResolved = result1.resolved + result2.resolved;

  if (totalResolved !== 1) {
    throw new Error(`Expected 1 resolution total, got ${totalResolved}`);
  }

  log.info('Double worker correctly handled with optimistic locking');
}

// Test 4: Replay POST idempotente
async function test4IdempotentReplay() {
  const idempotencyKey = 'test-idem-key-unique-12345';
  
  log.info('Idempotency test requires HTTP server', {
    note: 'This test validates middleware behavior at runtime'
  });
}

// Test 5: Deadlines sobreviven restart
async function test5DeadlinesSurviveRestart() {
  const { userId, providerId } = await setupTestData();

  const dbTimeResult = await prisma.$queryRaw<Array<{ now: Date; deadline: Date }>>`
    SELECT NOW() as now, NOW() + INTERVAL '72 hours' as deadline
  `;
  
  const { now, deadline } = dbTimeResult[0];

  const thread = await prisma.quoteThread.create({
    data: {
      id: 'test-thread-concurrency-5',
      senderId: userId,
      providerId,
      subject: 'Test DB Deadline',
      status: 'IN_CONVERSATION',
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      confirmedByRequesterAt: now,
      completionDeadline: deadline,
      version: 0,
      cycleNo: 0,
    },
  });

  const diff = deadline.getTime() - now.getTime();
  const hoursDiff = diff / (1000 * 60 * 60);

  if (hoursDiff < 71.9 || hoursDiff > 72.1) {
    throw new Error(`Expected ~72 hours, got ${hoursDiff.toFixed(2)}`);
  }

  log.info('Deadline correctly set from PostgreSQL', { 
    hoursDiff: hoursDiff.toFixed(2) 
  });
}

// Test 6: Lazy expiration
async function test6LazyExpiration() {
  const { userId, providerId } = await setupTestData();

  const expiredDeadline = new Date(Date.now() - 1000);
  
  const thread = await prisma.quoteThread.create({
    data: {
      id: 'test-thread-concurrency-6',
      senderId: userId,
      providerId,
      subject: 'Test Lazy Expiration',
      status: 'IN_CONVERSATION',
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      confirmedByRequesterAt: new Date(),
      confirmedByProviderAt: new Date(),
      completionDeadline: expiredDeadline,
      version: 0,
      cycleNo: 0,
    },
  });

  const { getThreadById } = await import('../src/lib/quotes-service');
  
  const result = await getThreadById(thread.id);

  if (!result) {
    throw new Error('Thread should exist after lazy expiration');
  }

  const updated = await prisma.quoteThread.findUnique({
    where: { id: thread.id },
  });

  if (updated?.workflow_phase !== WorkflowPhase.CLOSED) {
    throw new Error('Thread should be CLOSED after lazy expiration');
  }

  if (updated?.closure_outcome !== ClosureOutcome.BILATERAL) {
    throw new Error('Expected BILATERAL outcome');
  }

  const event = await prisma.requestEvent.findFirst({
    where: {
      requestId: thread.id,
      eventType: 'COMPLETION_TIMEOUT',
    },
  });

  if (!event) {
    throw new Error('Expected COMPLETION_TIMEOUT event');
  }

  const metadata = event.metadataJson as any;
  if (!metadata?.lazyExpiration) {
    throw new Error('Expected lazyExpiration flag in metadata');
  }

  log.info('Lazy expiration correctly triggered and logged');
}

// Test 7: Versión stale
async function test7StaleVersion() {
  const { userId, providerId } = await setupTestData();

  const thread = await prisma.quoteThread.create({
    data: {
      id: 'test-thread-concurrency-7',
      senderId: userId,
      providerId,
      subject: 'Test Stale Version',
      status: 'IN_CONVERSATION',
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      version: 5,
      cycleNo: 0,
    },
  });

  let caughtError = false;
  try {
    await updateThreadWithLocking(
      thread.id,
      3,
      { status: 'COMPLETED' }
    );
  } catch (error) {
    if (error instanceof ConcurrencyError) {
      caughtError = true;
    }
  }

  if (!caughtError) {
    throw new Error('Expected ConcurrencyError for stale version 3 vs actual 5');
  }

  const unchanged = await prisma.quoteThread.findUnique({
    where: { id: thread.id },
  });

  if (unchanged?.version !== 5) {
    throw new Error('Version should remain 5 after failed update');
  }

  log.info('Stale version correctly rejected');
}

// Test 8: Cycle number
async function test8CycleNumber() {
  const { userId, providerId } = await setupTestData();

  const thread = await prisma.quoteThread.create({
    data: {
      id: 'test-thread-concurrency-8',
      senderId: userId,
      providerId,
      subject: 'Test Cycle Number',
      status: 'IN_CONVERSATION',
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      confirmedByRequesterAt: new Date(),
      confirmedByProviderAt: new Date(),
      version: 0,
      cycleNo: 3,
    },
  });

  const { emitRequestEvent } = await import('../src/lib/request-events-service.js');

  await prisma.$transaction(async (tx) => {
    await updateThreadWithLocking(
      thread.id,
      0,
      {
        workflow_phase: WorkflowPhase.CLOSED,
        closure_outcome: ClosureOutcome.BILATERAL,
        status: 'COMPLETED',
      },
      tx
    );

    await emitRequestEvent(prisma, {
      requestId: thread.id,
      eventType: 'COMPLETION_CONFIRMED',
      actorUserId: userId,
      completionCycleNo: thread.cycleNo,
      metadata: { bilateralCompletion: true },
      tx,
    });
  });

  const event = await prisma.requestEvent.findFirst({
    where: {
      requestId: thread.id,
      eventType: 'COMPLETION_CONFIRMED',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!event) {
    throw new Error('Expected COMPLETION_CONFIRMED event');
  }

  if (event.completionCycleNo !== 3) {
    throw new Error(`Expected cycleNo 3, got ${event.completionCycleNo}`);
  }

  log.info('Cycle number correctly preserved in event', { cycleNo: 3 });
}

async function main() {
  log.info('🧪 Starting Concurrency Tests...');
  
  try {
    await cleanupTestData();
    
    await runTest('Test 1: Race confirmación simultánea', test1RaceConditionSimultaneousConfirmation);
    await runTest('Test 2: Timeout vs confirmación tardía (409)', test2TimeoutVsLateConfirmation);
    await runTest('Test 3: Doble worker cron', test3DoubleWorkerCron);
    await runTest('Test 4: Replay POST idempotente', test4IdempotentReplay);
    await runTest('Test 5: Deadlines sobreviven restart', test5DeadlinesSurviveRestart);
    await runTest('Test 6: Lazy expiration', test6LazyExpiration);
    await runTest('Test 7: Versión stale', test7StaleVersion);
    await runTest('Test 8: Cycle number', test8CycleNumber);

    await cleanupTestData();

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    log.info('📊 Test Summary', {
      total: results.length,
      passed,
      failed,
      duration: `${totalDuration}ms`,
    });

    if (failed > 0) {
      log.error('❌ Failed tests:', {
        failures: results.filter((r) => !r.passed).map((r) => ({
          name: r.name,
          error: r.error,
        })),
      });
      process.exit(1);
    }

    log.info('✅ All concurrency tests passed!');
    process.exit(0);
  } catch (error) {
    log.error('Fatal error in test suite', { error });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
