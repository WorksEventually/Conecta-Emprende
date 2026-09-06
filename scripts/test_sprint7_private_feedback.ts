import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";

const ids = {
  requester: "s7-feedback-requester",
  providerUser: "s7-feedback-provider-user",
  provider: "s7-feedback-provider",
  thread: "s7-feedback-thread",
};

async function main() {
  await prisma.user.createMany({
    data: [
      { id: ids.requester, email: "s7-feedback-requester@example.test", role: "USER" },
      { id: ids.providerUser, email: "s7-feedback-provider@example.test", role: "PROVIDER" },
    ],
    skipDuplicates: true,
  });
  await prisma.provider.create({
    data: {
      id: ids.provider,
      userId: ids.providerUser,
      displayName: "Sprint 7 Feedback Provider",
      slug: "sprint-7-feedback-provider",
      city: "MANAGUA",
      category: "SERVICIOS",
      subcategories: [],
    },
  });
  await prisma.quoteThread.create({
    data: {
      id: ids.thread,
      senderId: ids.requester,
      providerId: ids.provider,
      subject: "Private feedback test",
      workflow_phase: "CLOSED",
      closure_outcome: "BILATERAL",
    },
  });

  const created = await prisma.providerPrivateFeedback.create({
    data: { requestId: ids.thread, providerId: ids.provider, authorId: ids.providerUser, note: "Cliente claro y respetuoso." },
  });
  assert.equal(created.note, "Cliente claro y respetuoso.");
  assert.equal((await prisma.providerPrivateFeedback.count({ where: { requestId: ids.thread } })), 1);

  const updated = await prisma.providerPrivateFeedback.update({
    where: { requestId: ids.thread },
    data: { note: "Feedback actualizado y privado." },
  });
  assert.equal(updated.note, "Feedback actualizado y privado.");
  assert.equal((await prisma.review.count({ where: { requestId: ids.thread } })), 0);
  assert.equal((await prisma.reputationEvent.count({ where: { requestId: ids.thread } })), 0);
  console.log("✅ Sprint 7 private feedback tests passed (4/4)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.providerPrivateFeedback.deleteMany({ where: { requestId: ids.thread } });
    await prisma.quoteThread.deleteMany({ where: { id: ids.thread } });
    await prisma.provider.deleteMany({ where: { id: ids.provider } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.requester, ids.providerUser] } } });
    await prisma.$disconnect();
  });
