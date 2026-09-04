import { WorkflowPhase, ClosureOutcome } from "@prisma/client";
import { prisma } from "../db";
import { recalculateProviderTrustScore } from "../trust-score-service";
import { analyzeProviderRisk } from "../risk-telemetry-service";
import { emitRequestEvent } from "../request-events-service.js";
import { createLogger } from "../logger.js";

const log = createLogger('CronExpiredQuotes');

export async function resolveExpiredQuotes() {
  const now = new Date();
  const expired = await prisma.quoteThread.findMany({
    where: {
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      completionDeadline: { lte: now },
    },
  });

  if (expired.length === 0) {
    log.info('No expired quotes', { timestamp: now.toISOString() });
    return { resolved: 0 };
  }

  let resolved = 0;
  for (const thread of expired) {
    const { confirmedByRequesterAt, confirmedByProviderAt } = thread;
    let closure_outcome: ClosureOutcome;

    if (confirmedByRequesterAt && confirmedByProviderAt) {
      closure_outcome = ClosureOutcome.BILATERAL;
    } else if (confirmedByRequesterAt && !confirmedByProviderAt) {
      closure_outcome = ClosureOutcome.REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE;
    } else if (confirmedByProviderAt && !confirmedByRequesterAt) {
      closure_outcome = ClosureOutcome.PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE;
    } else {
      log.warn('Thread in COMPLETION_PENDING without confirmations', { 
        threadId: thread.id 
      });
      closure_outcome = ClosureOutcome.CANCELLED_BY_REQUESTER;
    }

    let legacyStatus: string;
    switch (closure_outcome) {
      case ClosureOutcome.BILATERAL:
        legacyStatus = "COMPLETED";
        break;
      case ClosureOutcome.REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE:
        legacyStatus = "CLOSED_PROVIDER";
        break;
      case ClosureOutcome.PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE:
        legacyStatus = "CLOSED_REQUESTER";
        break;
      default:
        legacyStatus = "CLOSED";
    }

    await prisma.$transaction(async (tx) => {
      await tx.quoteThread.update({
        where: { id: thread.id },
        data: { 
          workflow_phase: WorkflowPhase.CLOSED, 
          closure_outcome, 
          completedAt: now, 
          status: legacyStatus 
        },
      });

      await emitRequestEvent(prisma, {
        requestId: thread.id,
        eventType: 'COMPLETION_TIMEOUT',
        completionCycleNo: thread.cycleNo || 0,
        metadata: {
          outcome: closure_outcome,
          deadline: thread.completionDeadline?.toISOString(),
          confirmedByRequester: !!confirmedByRequesterAt,
          confirmedByProvider: !!confirmedByProviderAt,
        },
        tx,
      });

      log.info('Thread closed by timeout', { 
        threadId: thread.id, 
        outcome: closure_outcome 
      });
    });

    if (closure_outcome === ClosureOutcome.BILATERAL) {
      recalculateProviderTrustScore(thread.providerId)
        .catch((err) => log.error('TrustScore cron recalc failed', { error: err }));
      
      analyzeProviderRisk(thread.providerId)
        .catch((err) => log.error('RiskTelemetry cron analysis failed', { error: err }));
    }
    resolved++;
  }

  log.info('Resolved expired quotes', { resolved });
  return { resolved };
}