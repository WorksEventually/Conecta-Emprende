import { PrismaClient, WorkflowPhase, ClosureOutcome } from "@prisma/client";
import { emitRequestEvent, generateIdempotencyKey } from "../src/lib/request-events-service.js";

const prisma = new PrismaClient();

async function backfillRequestEvents() {
  console.log("=".repeat(60));
  console.log("Starting REQUEST EVENTS Backfill...");
  console.log("=".repeat(60));

  const threads = await prisma.quoteThread.findMany({
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${threads.length} threads to backfill.`);

  let totalEventsCreated = 0;
  let totalEventsSkipped = 0;
  let threadsProcessed = 0;

  for (const thread of threads) {
    const threadEvents: string[] = [];

    try {
      const eventTimestamps = {
        created: thread.createdAt,
        providerResponded: thread.messages.find((m) => m.authorRole === "provider")?.createdAt,
        quoteAccepted:
          thread.acceptedQuotation &&
          typeof thread.acceptedQuotation === "object" &&
          thread.acceptedQuotation !== null &&
          "acceptedAt" in thread.acceptedQuotation
            ? new Date((thread.acceptedQuotation as { acceptedAt: string }).acceptedAt)
            : undefined,
        requesterConfirmed: thread.confirmedByRequesterAt,
        providerConfirmed: thread.confirmedByProviderAt,
        completed: thread.completedAt,
      };

      const event1 = await emitRequestEvent(prisma, {
        requestId: thread.id,
        eventType: "REQUEST_CREATED",
        actorUserId: thread.senderId,
        metadata: {
          migrated: true,
          subject: thread.subject,
          providerId: thread.providerId,
        },
        occurredAt: eventTimestamps.created,
      });

      if (event1.isNew) {
        totalEventsCreated++;
        threadEvents.push("REQUEST_CREATED");
      } else {
        totalEventsSkipped++;
      }

      if (eventTimestamps.providerResponded) {
        const event2 = await emitRequestEvent(prisma, {
          requestId: thread.id,
          eventType: "PROVIDER_RESPONDED",
          actorUserId: undefined,
          metadata: {
            migrated: true,
            firstResponse: true,
          },
          occurredAt: eventTimestamps.providerResponded,
        });

        if (event2.isNew) {
          totalEventsCreated++;
          threadEvents.push("PROVIDER_RESPONDED");
        } else {
          totalEventsSkipped++;
        }
      }

      if (eventTimestamps.quoteAccepted) {
        const event3 = await emitRequestEvent(prisma, {
          requestId: thread.id,
          eventType: "QUOTE_ACCEPTED",
          actorUserId: thread.senderId,
          metadata: {
            migrated: true,
            price: thread.quotedPriceLabel,
            delivery: thread.quotedDeliveryTime,
          },
          occurredAt: eventTimestamps.quoteAccepted,
        });

        if (event3.isNew) {
          totalEventsCreated++;
          threadEvents.push("QUOTE_ACCEPTED");
        } else {
          totalEventsSkipped++;
        }
      }

      if (eventTimestamps.requesterConfirmed && !eventTimestamps.providerConfirmed) {
        const event4 = await emitRequestEvent(prisma, {
          requestId: thread.id,
          eventType: "COMPLETION_REQUESTED",
          actorUserId: thread.senderId,
          completionCycleNo: thread.cycleNo || 0,
          metadata: {
            migrated: true,
            actor: "requester",
          },
          occurredAt: eventTimestamps.requesterConfirmed,
        });

        if (event4.isNew) {
          totalEventsCreated++;
          threadEvents.push("COMPLETION_REQUESTED (requester)");
        } else {
          totalEventsSkipped++;
        }
      }

      if (eventTimestamps.providerConfirmed && !eventTimestamps.requesterConfirmed) {
        const providerUserId = await prisma.provider.findUnique({
          where: { id: thread.providerId },
          select: { userId: true },
        });

        const event5 = await emitRequestEvent(prisma, {
          requestId: thread.id,
          eventType: "COMPLETION_REQUESTED",
          actorUserId: providerUserId?.userId,
          completionCycleNo: thread.cycleNo || 0,
          metadata: {
            migrated: true,
            actor: "provider",
          },
          occurredAt: eventTimestamps.providerConfirmed,
        });

        if (event5.isNew) {
          totalEventsCreated++;
          threadEvents.push("COMPLETION_REQUESTED (provider)");
        } else {
          totalEventsSkipped++;
        }
      }

      if (thread.workflow_phase === WorkflowPhase.CLOSED && eventTimestamps.completed) {
        if (thread.closure_outcome === ClosureOutcome.BILATERAL) {
          const event6 = await emitRequestEvent(prisma, {
            requestId: thread.id,
            eventType: "COMPLETION_CONFIRMED",
            actorUserId: thread.senderId,
            completionCycleNo: thread.cycleNo || 0,
            metadata: {
              migrated: true,
              bilateralCompletion: true,
            },
            occurredAt: eventTimestamps.completed,
          });

          if (event6.isNew) {
            totalEventsCreated++;
            threadEvents.push("COMPLETION_CONFIRMED");
          } else {
            totalEventsSkipped++;
          }
        } else if (
          thread.closure_outcome === ClosureOutcome.REQUESTER_CONFIRMED_PROVIDER_NO_RESPONSE ||
          thread.closure_outcome === ClosureOutcome.PROVIDER_CLAIMED_REQUESTER_NO_RESPONSE
        ) {
          const event7 = await emitRequestEvent(prisma, {
            requestId: thread.id,
            eventType: "COMPLETION_TIMEOUT",
            completionCycleNo: thread.cycleNo || 0,
            metadata: {
              migrated: true,
              outcome: thread.closure_outcome,
              deadline: thread.completionDeadline?.toISOString(),
              confirmedByRequester: !!eventTimestamps.requesterConfirmed,
              confirmedByProvider: !!eventTimestamps.providerConfirmed,
            },
            occurredAt: eventTimestamps.completed,
          });

          if (event7.isNew) {
            totalEventsCreated++;
            threadEvents.push("COMPLETION_TIMEOUT");
          } else {
            totalEventsSkipped++;
          }
        } else if (thread.closure_outcome === ClosureOutcome.CANCELLED_BY_REQUESTER) {
          const event8 = await emitRequestEvent(prisma, {
            requestId: thread.id,
            eventType: "CANCELLED_BY_REQUESTER",
            actorUserId: thread.senderId,
            metadata: {
              migrated: true,
            },
            occurredAt: eventTimestamps.completed,
          });

          if (event8.isNew) {
            totalEventsCreated++;
            threadEvents.push("CANCELLED_BY_REQUESTER");
          } else {
            totalEventsSkipped++;
          }
        } else if (
          thread.closure_outcome === ClosureOutcome.CANCELLED_BY_PROVIDER ||
          thread.closure_outcome === ClosureOutcome.CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT
        ) {
          const providerUserId = await prisma.provider.findUnique({
            where: { id: thread.providerId },
            select: { userId: true },
          });

          const event9 = await emitRequestEvent(prisma, {
            requestId: thread.id,
            eventType: "CANCELLED_BY_PROVIDER",
            actorUserId: providerUserId?.userId,
            metadata: {
              migrated: true,
              hasEngagement:
                thread.closure_outcome === ClosureOutcome.CANCELLED_BY_PROVIDER_AFTER_ENGAGEMENT,
            },
            occurredAt: eventTimestamps.completed,
          });

          if (event9.isNew) {
            totalEventsCreated++;
            threadEvents.push("CANCELLED_BY_PROVIDER");
          } else {
            totalEventsSkipped++;
          }
        } else if (thread.closure_outcome === ClosureOutcome.MODERATION_CLOSURE) {
          const event10 = await emitRequestEvent(prisma, {
            requestId: thread.id,
            eventType: "MODERATION_CLOSURE",
            metadata: {
              migrated: true,
            },
            occurredAt: eventTimestamps.completed,
          });

          if (event10.isNew) {
            totalEventsCreated++;
            threadEvents.push("MODERATION_CLOSURE");
          } else {
            totalEventsSkipped++;
          }
        }
      }

      threadsProcessed++;

      if (threadEvents.length > 0) {
        console.log(`✓ Thread ${thread.id}: ${threadEvents.join(", ")}`);
      }
    } catch (error) {
      console.error(`✗ Error processing thread ${thread.id}:`, error);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("BACKFILL SUMMARY");
  console.log("=".repeat(60));
  console.log(`Threads processed: ${threadsProcessed}/${threads.length}`);
  console.log(`Events created: ${totalEventsCreated}`);
  console.log(`Events skipped (already exist): ${totalEventsSkipped}`);
  console.log("=".repeat(60));
  console.log("✓ Backfill completed successfully!");
}

backfillRequestEvents()
  .catch((error) => {
    console.error("Fatal error during backfill:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
