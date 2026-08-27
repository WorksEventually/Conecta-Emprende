import { WorkflowPhase, ClosureOutcome } from "@prisma/client";
import { prisma } from "../db";

export async function resolveExpiredQuotes() {
  const now = new Date();
  const expired = await prisma.quoteThread.findMany({
    where: {
      workflow_phase: WorkflowPhase.COMPLETION_PENDING,
      completionDeadline: { lte: now },
    },
  });

  if (expired.length === 0) {
    console.log(`[Cron] No expired quotes at ${now.toISOString()}`);
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
      console.warn(`Thread ${thread.id} in COMPLETION_PENDING without confirmations. Defaulting CANCELLED_BY_REQUESTER.`);
      closure_outcome = ClosureOutcome.CANCELLED_BY_REQUESTER;
    }

    await prisma.quoteThread.update({
      where: { id: thread.id },
      data: { workflow_phase: WorkflowPhase.CLOSED, closure_outcome, completedAt: now },
    });
    console.log(`[Cron] Closed thread ${thread.id} with outcome ${closure_outcome}`);
    resolved++;
  }

  console.log(`[Cron] Resolved ${resolved} expired quotes.`);
  return { resolved };
}