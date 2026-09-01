import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupLegacyQuoteStatus() {
  console.log("Starting cleanup of legacy quote statuses...");
  const threads = await prisma.quoteThread.findMany();
  console.log(`Found ${threads.length} threads to inspect.`);

  let updated = 0;
  let skipped = 0;

  for (const thread of threads) {
    let newStatus: string | null = null;

    switch (thread.status) {
      case "QUOTE_SENT":
        // Ya no se usa: la cotización se envía sin cambiar el estado del thread
        newStatus = "IN_CONVERSATION";
        break;
      case "QUOTE_ACCEPTED":
        // Ya no se usa: la aceptación es un evento opcional, no un estado
        newStatus = "IN_CONVERSATION";
        break;
      default:
        skipped++;
        continue;
    }

    await prisma.quoteThread.update({
      where: { id: thread.id },
      data: { status: newStatus },
    });
    updated++;
    console.log(`Thread ${thread.id}: status "${thread.status}" -> "${newStatus}"`);
  }

  console.log(`✅ Cleanup complete: ${updated} updated, ${skipped} skipped.`);
}

cleanupLegacyQuoteStatus()
  .catch((error) => { console.error("Cleanup failed:", error); process.exit(1); })
  .finally(() => prisma.$disconnect());