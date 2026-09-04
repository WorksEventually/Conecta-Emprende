import { PrismaClient } from '@prisma/client';
import { createReputationEvidence } from '../src/lib/reputation-events-service.js';

const prisma = new PrismaClient();

async function backfillReputationEvents() {
  console.log('🔄 Iniciando backfill de ReputationEvents...\n');

  let totalCreated = 0;
  let totalSkipped = 0;

  console.log('📊 Paso 1: Generando evidencias desde threads bilaterales...');
  const bilateralThreads = await prisma.quoteThread.findMany({
    where: {
      closure_outcome: 'BILATERAL',
      workflow_phase: 'CLOSED',
    },
    select: {
      id: true,
      providerId: true,
    },
  });

  console.log(`   Encontrados ${bilateralThreads.length} threads bilaterales`);

  for (const thread of bilateralThreads) {
    try {
      const result = await createReputationEvidence(prisma, {
        providerId: thread.providerId,
        requestId: thread.id,
        evidenceType: 'BILATERAL_COMPLETION',
        evidenceWeight: 1.0,
      });

      if (result.isNew) {
        totalCreated++;
      } else {
        totalSkipped++;
      }
    } catch (error: any) {
      console.error(`   ❌ Error en thread ${thread.id}: ${error.message}`);
    }
  }

  console.log(`   ✅ Creadas: ${totalCreated} | Omitidas: ${totalSkipped}\n`);

  console.log('📊 Paso 2: Generando evidencias desde reviews...');
  const reviews = await prisma.review.findMany({
    select: {
      id: true,
      providerId: true,
      requestId: true,
      weight: true,
    },
  });

  console.log(`   Encontradas ${reviews.length} reviews`);

  let reviewsCreated = 0;
  let reviewsSkipped = 0;

  for (const review of reviews) {
    try {
      const evidenceType = review.weight >= 1.0 
        ? 'UNILATERAL_REVIEW_QUALIFIED' 
        : 'UNILATERAL_REVIEW_QUALIFIED';

      const result = await createReputationEvidence(prisma, {
        providerId: review.providerId,
        requestId: review.requestId,
        evidenceType,
        evidenceWeight: review.weight,
      });

      if (result.isNew) {
        reviewsCreated++;
      } else {
        reviewsSkipped++;
      }
    } catch (error: any) {
      console.error(`   ❌ Error en review ${review.id}: ${error.message}`);
    }
  }

  console.log(`   ✅ Creadas: ${reviewsCreated} | Omitidas: ${reviewsSkipped}\n`);

  totalCreated += reviewsCreated;
  totalSkipped += reviewsSkipped;

  console.log('📊 Paso 3: Verificando integridad...');
  const totalEvidence = await prisma.reputationEvent.count();
  const activeEvidence = await prisma.reputationEvent.count({
    where: { invalidatedAt: null },
  });

  console.log(`   Total evidencias en DB: ${totalEvidence}`);
  console.log(`   Evidencias activas: ${activeEvidence}`);
  console.log(`   Evidencias invalidadas: ${totalEvidence - activeEvidence}\n`);

  console.log('📊 Paso 4: Verificando distribución por tipo...');
  const byType = await prisma.reputationEvent.groupBy({
    by: ['evidenceType'],
    _count: { id: true },
    where: { invalidatedAt: null },
  });

  byType.forEach((group) => {
    console.log(`   ${group.evidenceType}: ${group._count.id}`);
  });

  console.log('\n✅ Backfill completado');
  console.log(`   Nuevas evidencias creadas: ${totalCreated}`);
  console.log(`   Evidencias existentes (omitidas): ${totalSkipped}`);
  console.log(`   Total en base de datos: ${totalEvidence}`);

  return { totalCreated, totalSkipped, totalEvidence };
}

backfillReputationEvents()
  .then((result) => {
    console.log('\n✅ Script finalizado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en backfill:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
