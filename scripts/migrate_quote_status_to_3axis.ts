import { PrismaClient, WorkflowPhase, ClosureOutcome, ModerationState } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateQuoteThreads() {
  console.log("Starting QuoteThread migration to 3-axis model...");
  const threads = await prisma.quoteThread.findMany();
  console.log(`Found ${threads.length} threads to migrate.`);

  let migrated = 0;
  let skipped = 0;

  for (const thread of threads) {
    // Skip si ya migrado (re-run seguro)
    if (thread.workflow_phase !== WorkflowPhase.OPEN || thread.closure_outcome !== null) {
      skipped++;
      continue;
    }

    let workflow_phase: WorkflowPhase;
    let closure_outcome: ClosureOutcome | null = null;
    let moderation_state: ModerationState = ModerationState.CLEAN;
    let completionDeadline: Date | null = null;
    const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

    switch (thread.status) {
      case "OPEN":
      case "IN_CONVERSATION":
      case "QUOTE_SENT":
        workflow_phase = WorkflowPhase.OPEN;
        break;

      case "QUOTE_ACCEPTED": {
        const bothConfirmed = thread.confirmedByRequesterAt && thread.confirmedByProviderAt;
        if (bothConfirmed) {
          const lastConfirmation = Math.max(
            thread.confirmedByRequesterAt!.getTime(),
            thread.confirmedByProviderAt!.getTime()
          );
          if (Date.now() - lastConfirmation < SEVENTY_TWO_HOURS_MS) {
            workflow_phase = WorkflowPhase.COMPLETION_PENDING;
            completionDeadline = new Date(lastConfirmation + SEVENTY_TWO_HOURS_MS);
          } else {
            workflow_phase = WorkflowPhase.CLOSED;
            closure_outcome = ClosureOutcome.BILATERAL;
          }
        } else if (thread.confirmedByRequesterAt) {
          if (Date.now() - thread.confirmedByRequesterAt.getTime() < SEVENTY_TWO_HOURS_MS) {
            workflow_phase = WorkflowPhase.COMPLETION_PENDING;
            completionDeadline = new Date(thread.confirmedByRequesterAt.getTime() + SEVENTY_TWO_HOURS_MS);
          } else {
            workflow_phase = WorkflowPhase.CLOSED;
            closure_outcome = ClosureOutcome.REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE;
          }
        } else if (thread.confirmedByProviderAt) {
          if (Date.now() - thread.confirmedByProviderAt.getTime() < SEVENTY_TWO_HOURS_MS) {
            workflow_phase = WorkflowPhase.COMPLETION_PENDING;
            completionDeadline = new Date(thread.confirmedByProviderAt.getTime() + SEVENTY_TWO_HOURS_MS);
          } else {
            workflow_phase = WorkflowPhase.CLOSED;
            closure_outcome = ClosureOutcome.PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE;
          }
        } else {
          console.warn(`Thread ${thread.id} QUOTE_ACCEPTED sin confirmaciones. Mapping to OPEN.`);
          workflow_phase = WorkflowPhase.OPEN;
        }
        break;
      }

      case "COMPLETED":
        workflow_phase = WorkflowPhase.CLOSED;
        closure_outcome = ClosureOutcome.BILATERAL;
        break;

      case "CLOSED_REQUESTER":
        workflow_phase = WorkflowPhase.CLOSED;
        closure_outcome = ClosureOutcome.CANCELLED_BY_REQUESTER;
        break;

      case "CLOSED_PROVIDER":
        workflow_phase = WorkflowPhase.CLOSED;
        closure_outcome = ClosureOutcome.CANCELLED_BY_PROVIDER;
        break;

      case "CANCELLED":
        workflow_phase = WorkflowPhase.CLOSED;
        closure_outcome = ClosureOutcome.CANCELLED_BY_REQUESTER;
        break;

      default:
        console.warn(`Unknown status: "${thread.status}" for thread ${thread.id}. Mapping to OPEN.`);
        workflow_phase = WorkflowPhase.OPEN;
    }

    await prisma.quoteThread.update({
      where: { id: thread.id },
      data: { workflow_phase, closure_outcome, moderation_state, completionDeadline },
    });
    migrated++;
  }

  console.log(`✅ Migration complete: ${migrated} migrated, ${skipped} skipped.`);
}

migrateQuoteThreads()
  .catch((error) => { console.error("Migration failed:", error); process.exit(1); })
  .finally(() => prisma.$disconnect());