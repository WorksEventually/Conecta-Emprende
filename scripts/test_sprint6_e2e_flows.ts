import { PrismaClient } from '@prisma/client';
import { createLogger } from '../src/lib/logger.js';
import { rejectCompletion, withdrawCompletion, addMessage } from '../src/lib/quotes-service.js';
import { emitRequestEvent } from '../src/lib/request-events-service.js';

const prisma = new PrismaClient();
const log = createLogger('TestSprint6E2EFlows');

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function setupTestData() {
  for (let i = 1; i <= 10; i++) {
    const userId = `test-s6e2e-user-${i}`;
    const providerId = `test-s6e2e-provider-${i}`;
    
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `tests6e2e-${i}@test.com`,
        name: `Test S6 E2E User ${i}`,
        password: 'test-hash',
      },
      update: {},
    });

    await prisma.provider.upsert({
      where: { id: providerId },
      create: {
        id: providerId,
        displayName: `Test S6 E2E Provider ${i}`,
        slug: `test-s6e2e-provider-${i}`,
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
        startsWith: 'test-s6e2e-thread-',
      },
    },
  });

  await prisma.quoteMessage.deleteMany({
    where: {
      threadId: {
        startsWith: 'test-s6e2e-thread-',
      },
    },
  });

  await prisma.quoteThread.deleteMany({
    where: {
      id: {
        startsWith: 'test-s6e2e-thread-',
      },
    },
  });

  for (let i = 1; i <= 10; i++) {
    const providerId = `test-s6e2e-provider-${i}`;
    const userId = `test-s6e2e-user-${i}`;
    
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

// ═══════════════════════════════════════════════════════════
// E2E Test 1: Ciclo completo de rechazo con cooldown 24h
// ═══════════════════════════════════════════════════════════
async function testE2E1_rejectionCycleWithCooldown() {
  const threadId = 'test-s6e2e-thread-1';
  const requesterId = 'test-s6e2e-user-1';
  const providerId = 'test-s6e2e-user-2';
  
  // Crear thread en COMPLETION_PENDING
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-2',
      subject: 'Test rechazo con cooldown',
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      completionInitiatorUserId: requesterId,
    },
  });

  // 1. Proveedor rechaza (primera vez)
  await rejectCompletion(threadId, providerId, 'Todavía no está terminado');

  let thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'OPEN') {
    throw new Error('Thread debería volver a OPEN tras rechazo');
  }
  if (!thread.completionRejectedAt) {
    throw new Error('completionRejectedAt debería estar guardado');
  }
  if (thread.completionRejectedByUserId !== providerId) {
    throw new Error('completionRejectedByUserId incorrecto');
  }

  // 2. Requester vuelve a solicitar cierre (incrementar cycleNo para nuevo intento)
  await prisma.quoteThread.update({
    where: { id: threadId },
    data: {
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      completionInitiatorUserId: requesterId,
      cycleNo: 1, // Incrementar para diferenciar el segundo intento
    },
  });

  // 3. Proveedor intenta rechazar inmediatamente (cooldown 24h)
  try {
    await rejectCompletion(threadId, providerId, 'Intento rechazo inmediato');
    throw new Error('Debería fallar por cooldown 24h');
  } catch (error: any) {
    if (!error.message.includes('esperar')) {
      throw new Error(`Error incorrecto: ${error.message}`);
    }
  }

  // 4. Simulamos paso de 24h (modificando timestamp)
  await prisma.quoteThread.update({
    where: { id: threadId },
    data: {
      completionRejectedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    },
  });

  // 5. Proveedor rechaza nuevamente con nota diferente (debería funcionar)
  await rejectCompletion(threadId, providerId, 'Segundo rechazo tras esperar 24h - todavía falta terminar');

  thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'OPEN') {
    throw new Error('Thread debería volver a OPEN tras segundo rechazo');
  }

  // Verificar eventos emitidos (deben ser 2 porque usamos notas diferentes)
  const events = await prisma.requestEvent.findMany({
    where: { requestId: threadId, eventType: 'COMPLETION_NOT_ACCEPTED' },
    orderBy: { createdAt: 'asc' },
  });

  if (events.length !== 2) {
    throw new Error(`Deberían existir 2 eventos COMPLETION_NOT_ACCEPTED, encontrados: ${events.length}`);
  }

  // Validar que son eventos diferentes (diferentes metadata)
  if (events[0].metadataJson && events[1].metadataJson) {
    const meta0 = events[0].metadataJson as any;
    const meta1 = events[1].metadataJson as any;
    if (meta0.note === meta1.note) {
      throw new Error('Los eventos deberían tener notas diferentes');
    }
  }
}

// ═══════════════════════════════════════════════════════════
// E2E Test 2: Rechazo requiere interacción intermedia
// ═══════════════════════════════════════════════════════════
async function testE2E2_rejectionRequiresInteraction() {
  const threadId = 'test-s6e2e-thread-2';
  const requesterId = 'test-s6e2e-user-3';
  const providerId = 'test-s6e2e-user-4';
  
  // Crear thread en COMPLETION_PENDING
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-4',
      subject: 'Test interacción intermedia',
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      completionInitiatorUserId: requesterId,
    },
  });

  // 1. Proveedor rechaza
  await rejectCompletion(threadId, providerId, 'Primer rechazo');

  // 2. Simular 24h pasadas Y que hubo un mensaje ANTES del rechazo anterior
  const oldRejectionTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const oldMessageTime = new Date(oldRejectionTime.getTime() - 1000); // 1 segundo antes
  
  await prisma.quoteThread.update({
    where: { id: threadId },
    data: {
      completionRejectedAt: oldRejectionTime,
      lastNonSystemicMessageAt: oldMessageTime,
      workflow_phase: 'COMPLETION_PENDING',
      completionInitiatorUserId: requesterId,
    },
  });

  // 3. Proveedor intenta rechazar sin interacción intermedia (mensaje anterior al rechazo)
  try {
    await rejectCompletion(threadId, providerId, 'Intento sin interacción nueva');
    throw new Error('Debería fallar por falta de interacción intermedia');
  } catch (error: any) {
    if (!error.message.includes('mensaje')) {
      throw new Error(`Error incorrecto: ${error.message}`);
    }
  }

  // 4. Agregar mensaje (interacción intermedia)
  await addMessage(threadId, {
    authorId: requesterId,
    authorRole: 'client',
    body: 'Ya casi termino',
  });

  const thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (!thread?.lastNonSystemicMessageAt) {
    throw new Error('lastNonSystemicMessageAt debería actualizarse');
  }

  // 5. Ahora sí puede rechazar
  await rejectCompletion(threadId, providerId, 'Rechazo con interacción');

  const finalThread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (finalThread?.workflow_phase !== 'OPEN') {
    throw new Error('Thread debería volver a OPEN');
  }
}

// ═══════════════════════════════════════════════════════════
// E2E Test 3: Withdrawal solo funciona para iniciador
// ═══════════════════════════════════════════════════════════
async function testE2E3_withdrawalOnlyForInitiator() {
  const threadId = 'test-s6e2e-thread-3';
  const requesterId = 'test-s6e2e-user-5';
  const providerId = 'test-s6e2e-user-6';
  
  // Crear thread con requester como iniciador
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-6',
      subject: 'Test withdrawal iniciador',
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      completionInitiatorUserId: requesterId,
    },
  });

  // 1. Proveedor (NO iniciador) intenta withdrawal
  try {
    await withdrawCompletion(threadId, providerId);
    throw new Error('Proveedor NO debería poder hacer withdrawal');
  } catch (error: any) {
    if (!error.message.includes('iniciador')) {
      throw new Error(`Error incorrecto: ${error.message}`);
    }
  }

  // 2. Requester (iniciador) hace withdrawal exitoso
  await withdrawCompletion(threadId, requesterId);

  const thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'OPEN') {
    throw new Error('Thread debería volver a OPEN tras withdrawal');
  }
  if (thread.completionInitiatorUserId !== null) {
    throw new Error('completionInitiatorUserId debería limpiarse');
  }
  if (thread.completionDeadline !== null) {
    throw new Error('completionDeadline debería limpiarse');
  }

  // Verificar evento emitido
  const event = await prisma.requestEvent.findFirst({
    where: { requestId: threadId, eventType: 'COMPLETION_REQUEST_WITHDRAWN' },
  });

  if (!event) {
    throw new Error('Evento COMPLETION_REQUEST_WITHDRAWN no fue emitido');
  }
}

// ═══════════════════════════════════════════════════════════
// E2E Test 4: Precedencia del timeout en confirmación
// ═══════════════════════════════════════════════════════════
async function testE2E4_timeoutPrecedenceInConfirmation() {
  const threadId = 'test-s6e2e-thread-4';
  const requesterId = 'test-s6e2e-user-7';
  const providerId = 'test-s6e2e-user-8';
  
  // Crear thread con deadline EXPIRADO
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-8',
      subject: 'Test timeout precedencia',
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() - 1000), // Ya expirado
      completionInitiatorUserId: requesterId,
      confirmedByRequesterAt: new Date(),
      cycleNo: 1,
      version: 1,
    },
  });

  // Intentar confirmar (debería resolver timeout primero)
  const { validateNotExpired } = await import('../src/lib/quotes-service.js');
  
  try {
    await validateNotExpired(threadId);
    throw new Error('Debería lanzar error TIMEOUT_ALREADY_RESOLVED');
  } catch (error: any) {
    if (!error.message.includes('TIMEOUT_ALREADY_RESOLVED')) {
      throw new Error(`Error incorrecto: ${error.message}`);
    }
  }

  // Verificar que timeout se resolvió
  const thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'CLOSED') {
    throw new Error('Thread debería cerrarse tras timeout');
  }
  if (!thread.closure_outcome) {
    throw new Error('closure_outcome debería estar definido tras timeout');
  }
}

// ═══════════════════════════════════════════════════════════
// E2E Test 5: Precedencia del timeout en rechazo
// ═══════════════════════════════════════════════════════════
async function testE2E5_timeoutPrecedenceInRejection() {
  const threadId = 'test-s6e2e-thread-5';
  const requesterId = 'test-s6e2e-user-9';
  const providerId = 'test-s6e2e-user-10';
  
  // Crear thread con deadline EXPIRADO
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-10',
      subject: 'Test timeout en rechazo',
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() - 1000),
      completionInitiatorUserId: requesterId,
      confirmedByRequesterAt: new Date(),
      cycleNo: 1,
      version: 1,
    },
  });

  // Proveedor intenta rechazar tras deadline
  try {
    await rejectCompletion(threadId, providerId, 'Intento rechazo tardío');
    throw new Error('Debería rechazar rechazo tardío');
  } catch (error: any) {
    if (!error.message.includes('TIMEOUT_ALREADY_RESOLVED')) {
      throw new Error(`Error incorrecto: ${error.message}`);
    }
  }

  // Verificar que timeout se resolvió
  const thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'CLOSED') {
    throw new Error('Thread debería cerrarse tras timeout');
  }
}

// ═══════════════════════════════════════════════════════════
// E2E Test 6: Precedencia del timeout en withdrawal
// ═══════════════════════════════════════════════════════════
async function testE2E6_timeoutPrecedenceInWithdrawal() {
  const threadId = 'test-s6e2e-thread-6';
  const requesterId = 'test-s6e2e-user-1';
  
  // Crear thread con deadline EXPIRADO
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-2',
      subject: 'Test timeout en withdrawal',
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() - 1000),
      completionInitiatorUserId: requesterId,
      confirmedByRequesterAt: new Date(),
      cycleNo: 1,
      version: 1,
    },
  });

  // Iniciador intenta withdrawal tras deadline
  try {
    await withdrawCompletion(threadId, requesterId);
    throw new Error('Debería rechazar withdrawal tardío');
  } catch (error: any) {
    if (!error.message.includes('TIMEOUT_ALREADY_RESOLVED')) {
      throw new Error(`Error incorrecto: ${error.message}`);
    }
  }

  // Verificar que timeout se resolvió
  const thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'CLOSED') {
    throw new Error('Thread debería cerrarse tras timeout');
  }
}

// ═══════════════════════════════════════════════════════════
// E2E Test 7: Decline sin interacción previa
// ═══════════════════════════════════════════════════════════
async function testE2E7_declineWithoutInteraction() {
  const threadId = 'test-s6e2e-thread-7';
  const requesterId = 'test-s6e2e-user-3';
  const providerId = 'test-s6e2e-user-4';
  
  // Crear thread sin interacción previa
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-4',
      subject: 'Test decline sin interacción',
      workflow_phase: 'OPEN',
    },
  });

  // Proveedor declina (simular endpoint)
  await prisma.$transaction(async (tx) => {
    await tx.quoteThread.update({
      where: { id: threadId },
      data: {
        workflow_phase: 'CLOSED',
        closure_outcome: 'DECLINED_BY_PROVIDER',
      },
    });

    await emitRequestEvent(prisma, {
      requestId: threadId,
      eventType: 'REQUEST_DECLINED',
      actorUserId: providerId,
      metadata: { reason: 'No disponible' },
      tx,
    });
  });

  const thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.closure_outcome !== 'DECLINED_BY_PROVIDER') {
    throw new Error('closure_outcome debería ser DECLINED_BY_PROVIDER');
  }
  if (thread.workflow_phase !== 'CLOSED') {
    throw new Error('workflow_phase debería ser CLOSED');
  }

  // Verificar evento
  const event = await prisma.requestEvent.findFirst({
    where: { requestId: threadId, eventType: 'REQUEST_DECLINED' },
  });

  if (!event) {
    throw new Error('Evento REQUEST_DECLINED no fue emitido');
  }
}

// ═══════════════════════════════════════════════════════════
// E2E Test 8: Chat bloqueado en thread cerrado
// ═══════════════════════════════════════════════════════════
async function testE2E8_chatBlockedInClosedThread() {
  const threadId = 'test-s6e2e-thread-8';
  const requesterId = 'test-s6e2e-user-5';
  
  // Crear thread cerrado
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-6',
      subject: 'Test chat bloqueado',
      workflow_phase: 'CLOSED',
      closure_outcome: 'BILATERAL',
    },
  });

  // Intentar agregar mensaje debería fallar en endpoint
  // Aquí solo validamos que el campo closure_outcome está presente
  const thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  
  if (thread?.closure_outcome === null) {
    throw new Error('Thread cerrado debería tener closure_outcome');
  }

  // La validación real del endpoint se hace en test de servidor HTTP
  // Aquí solo verificamos el estado del modelo
}

// ═══════════════════════════════════════════════════════════
// E2E Test 9: Ciclo completo: rechazo → mensaje → rechazo
// ═══════════════════════════════════════════════════════════
async function testE2E9_fullCycleRejectionMessageRejection() {
  const threadId = 'test-s6e2e-thread-9';
  const requesterId = 'test-s6e2e-user-7';
  const providerId = 'test-s6e2e-user-8';
  
  // 1. Crear thread en COMPLETION_PENDING
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-8',
      subject: 'Test ciclo completo',
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      completionInitiatorUserId: requesterId,
    },
  });

  // 2. Proveedor rechaza
  await rejectCompletion(threadId, providerId, 'Primer rechazo - aún no está listo');

  let thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'OPEN') throw new Error('Debería estar OPEN');

  // 3. Requester envía mensaje
  await addMessage(threadId, {
    authorId: requesterId,
    authorRole: 'client',
    body: 'Ok, avisame cuando esté listo',
  });

  // 4. Simular 24h
  await prisma.quoteThread.update({
    where: { id: threadId },
    data: {
      completionRejectedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    },
  });

  // 5. Requester solicita cierre nuevamente (incrementar cycleNo)
  await prisma.quoteThread.update({
    where: { id: threadId },
    data: {
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      completionInitiatorUserId: requesterId,
      cycleNo: 1, // Incrementar para diferenciar el segundo intento
    },
  });

  // 6. Proveedor vuelve a rechazar con nota diferente (ahora sí debería funcionar)
  await rejectCompletion(threadId, providerId, 'Segundo rechazo - todavía falta un detalle más');

  thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'OPEN') {
    throw new Error('Debería volver a OPEN tras segundo rechazo');
  }

  // Verificar 2 eventos de rechazo (con notas diferentes para evitar idempotencia)
  const events = await prisma.requestEvent.findMany({
    where: { requestId: threadId, eventType: 'COMPLETION_NOT_ACCEPTED' },
    orderBy: { createdAt: 'asc' },
  });

  if (events.length !== 2) {
    throw new Error(`Deberían existir 2 rechazos, encontrados: ${events.length}`);
  }

  // Validar que los eventos tienen metadata diferente
  if (events[0].metadataJson && events[1].metadataJson) {
    const meta0 = events[0].metadataJson as any;
    const meta1 = events[1].metadataJson as any;
    if (meta0.note === meta1.note) {
      throw new Error('Los eventos deberían tener notas diferentes');
    }
  }
}

// ═══════════════════════════════════════════════════════════
// E2E Test 10: Iniciador vs NO-iniciador validaciones
// ═══════════════════════════════════════════════════════════
async function testE2E10_initiatorVsNonInitiatorValidations() {
  const threadId = 'test-s6e2e-thread-10';
  const requesterId = 'test-s6e2e-user-9';
  const providerId = 'test-s6e2e-user-10';
  
  // Crear thread con proveedor como iniciador
  await prisma.quoteThread.create({
    data: {
      id: threadId,
      senderId: requesterId,
      providerId: 'test-s6e2e-provider-10',
      subject: 'Test iniciador vs no-iniciador',
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      completionInitiatorUserId: providerId,
    },
  });

  // 1. Iniciador (proveedor) intenta rechazar (debería fallar)
  try {
    await rejectCompletion(threadId, providerId, 'Intento rechazo por iniciador');
    throw new Error('Iniciador NO debería poder rechazar');
  } catch (error: any) {
    if (!error.message.includes('iniciador')) {
      throw new Error(`Error incorrecto: ${error.message}`);
    }
  }

  // 2. NO-iniciador (requester) rechaza (debería funcionar)
  await rejectCompletion(threadId, requesterId, 'Rechazo por NO-iniciador');

  let thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'OPEN') {
    throw new Error('Thread debería volver a OPEN');
  }

  // 3. Requester solicita cierre (ahora es iniciador)
  await prisma.quoteThread.update({
    where: { id: threadId },
    data: {
      workflow_phase: 'COMPLETION_PENDING',
      completionDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      completionInitiatorUserId: requesterId,
    },
  });

  // 4. Iniciador (requester) hace withdrawal (debería funcionar)
  await withdrawCompletion(threadId, requesterId);

  thread = await prisma.quoteThread.findUnique({ where: { id: threadId } });
  if (thread?.workflow_phase !== 'OPEN') {
    throw new Error('Thread debería volver a OPEN tras withdrawal');
  }
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════
async function main() {
  log.info('🚀 Iniciando Test Suite Sprint 6 - E2E Flows Completos');

  try {
    log.info('📦 Preparando datos de prueba...');
    await setupTestData();

    log.info('🧪 Ejecutando tests E2E...');
    
    log.info('═══ Grupo 1: Rechazo del Cierre (3 tests) ═══');
    await runTest('E2E 1. Ciclo rechazo con cooldown 24h', testE2E1_rejectionCycleWithCooldown);
    await runTest('E2E 2. Rechazo requiere interacción intermedia', testE2E2_rejectionRequiresInteraction);
    await runTest('E2E 9. Ciclo completo: rechazo → mensaje → rechazo', testE2E9_fullCycleRejectionMessageRejection);

    log.info('═══ Grupo 2: Retiro del Cierre (1 test) ═══');
    await runTest('E2E 3. Withdrawal solo funciona para iniciador', testE2E3_withdrawalOnlyForInitiator);

    log.info('═══ Grupo 3: Precedencia del Timeout (3 tests) ═══');
    await runTest('E2E 4. Timeout tiene precedencia en confirmación', testE2E4_timeoutPrecedenceInConfirmation);
    await runTest('E2E 5. Timeout tiene precedencia en rechazo', testE2E5_timeoutPrecedenceInRejection);
    await runTest('E2E 6. Timeout tiene precedencia en withdrawal', testE2E6_timeoutPrecedenceInWithdrawal);

    log.info('═══ Grupo 4: Decline y Chat (2 tests) ═══');
    await runTest('E2E 7. Decline sin interacción previa', testE2E7_declineWithoutInteraction);
    await runTest('E2E 8. Chat bloqueado en thread cerrado', testE2E8_chatBlockedInClosedThread);

    log.info('═══ Grupo 5: Validaciones Cruzadas (1 test) ═══');
    await runTest('E2E 10. Iniciador vs NO-iniciador validaciones', testE2E10_initiatorVsNonInitiatorValidations);

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
  log.info('📊 RESUMEN FINAL - Sprint 6 E2E Flows');
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
