/**
 * Risk Telemetry Integration Tests (E2E)
 *
 * Valida la generación automática de RiskReports cuando un proveedor
 * alcanza un score de riesgo ≥70 después del cierre bilateral de un QuoteThread.
 *
 * Prerequisites:
 *   1. PostgreSQL running with a test DB
 *   2. `prisma migrate deploy` executed
 *   3. `npm run dev` running (server on API_URL)
 *
 * Usage:
 *   API_URL=http://localhost:3000 npx tsx scripts/test_risk_integration_e2e.ts
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE_URL = process.env.API_URL ?? "http://localhost:3000";
const SEED_PASSWORD = "Conecta123!";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL ${name}${extra !== undefined ? ` - ${JSON.stringify(extra)}` : ""}`);
  }
}

async function api(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {}
): Promise<{ status: number; body: any; cookie: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const rawCookies: string[] =
    (res.headers as any).getSetCookie?.() ?? (res.headers.get("set-cookie")?.split(",") ?? []);
  const cookie = rawCookies.map((c) => c.split(";")[0]).join("; ");
  let body: any = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body, cookie };
}

async function login(email: string): Promise<{ cookie: string; userId: string }> {
  const res = await api("POST", "/api/auth/login", { body: { email, password: SEED_PASSWORD } });
  if (!res.body?.success) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  const userId = res.body?.data?.user?.id;
  if (!res.cookie || !userId) throw new Error(`No auth cookie/userId for ${email}`);
  return { cookie: res.cookie, userId };
}

async function createSuspiciousThread(requesterCookie: string, providerId: string): Promise<string> {
  const thread = await prisma.quoteThread.create({
    data: {
      senderId: requesterCookie,
      providerId,
      subject: "Thread sospechoso para test",
      status: "OPEN",
    },
  });

  await prisma.quoteMessage.create({
    data: {
      threadId: thread.id,
      authorId: requesterCookie,
      authorRole: "client",
      body: "Mensaje inicial",
    },
  });

  const now = new Date();
  const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

  await prisma.quoteThread.update({
    where: { id: thread.id },
    data: {
      confirmedByRequesterAt: fiveMinutesLater,
      confirmedByProviderAt: fiveMinutesLater,
      completedAt: fiveMinutesLater,
      workflow_phase: "CLOSED",
      closure_outcome: "BILATERAL",
      status: "COMPLETED",
    },
  });

  return thread.id;
}

async function main() {
  console.log("→ Risk Telemetry Integration Tests (E2E)\n");

  const requester = await login("requester@conecta.test");
  const provider = await login("textil@conecta.test");
  const providerRecord = await prisma.provider.findFirst({ where: { userId: provider.userId } });
  if (!providerRecord) throw new Error("Provider not found");
  const providerId = providerRecord.id;

  check("Requester + Provider login", Boolean(requester.cookie && provider.cookie));

  // Clean up temporary user if it exists from previous failed run
  await prisma.quoteThread.deleteMany({ 
    where: { sender: { email: "newaccount@risk-test.temp" } } 
  });
  await prisma.user.deleteMany({ 
    where: { email: "newaccount@risk-test.temp" } 
  });

  // Create temporary new user for Test 2 (account created today, <30 days old)
  const newUser = await prisma.user.create({
    data: {
      email: "newaccount@risk-test.temp",
      name: "New Account Test",
      password: await bcrypt.hash(SEED_PASSWORD, 10),
      createdAt: new Date(), // Fresh account (<30 days)
    },
  });

  // Deterministic start: the seeded provider already exhibits an anomalous
  // aggregate (fabricated fast completions, new accounts, single requester),
  // which generates a RiskReport on its own. Clean the provider state so
  // Test 1 validates the normal path in isolation (Test 2 recreates its own
  // suspicious data afterwards). Review.requestId is SetNull on thread delete,
  // and seed reviews are removed to reset the rating concentration signal.
  await prisma.quoteThread.deleteMany({ where: { providerId } });
  await prisma.review.deleteMany({ where: { providerId } });
  await prisma.riskReport.deleteMany({ where: { providerId } });

  console.log("\n--- Test 1: Thread normal no genera RiskReport ---");
  
  const normalThread = await prisma.quoteThread.create({
    data: {
      senderId: requester.userId,
      providerId,
      subject: "Thread normal",
      status: "OPEN",
    },
  });

  await prisma.quoteMessage.create({
    data: {
      threadId: normalThread.id,
      authorId: requester.userId,
      authorRole: "client",
      body: "Mensaje 1",
    },
  });

  await prisma.quoteMessage.create({
    data: {
      threadId: normalThread.id,
      authorId: provider.userId,
      authorRole: "provider",
      body: "Mensaje 2",
    },
  });

  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  await prisma.quoteThread.update({
    where: { id: normalThread.id },
    data: {
      confirmedByRequesterAt: twoHoursLater,
      confirmedByProviderAt: twoHoursLater,
      completedAt: twoHoursLater,
      workflow_phase: "CLOSED",
      closure_outcome: "BILATERAL",
      status: "COMPLETED",
      createdAt: now,
    },
  });

  const { analyzeProviderRisk } = await import("../src/lib/risk-telemetry-service");
  await analyzeProviderRisk(providerId);

  const reportAfterNormal = await prisma.riskReport.findFirst({
    where: { providerId, status: "OPEN" },
    orderBy: { generatedAt: "desc" },
  });

  check("Thread normal no genera RiskReport", !reportAfterNormal);

  console.log("\n--- Test 2: Thread sospechoso genera RiskReport ---");

  await prisma.quoteThread.deleteMany({ where: { providerId } });
  await prisma.riskReport.deleteMany({ where: { providerId } });

  for (let i = 0; i < 5; i++) {
    // Use newUser for 4 out of 5 threads (80% new accounts)
    const senderToUse = i < 4 ? newUser.id : requester.userId;
    
    const thread = await prisma.quoteThread.create({
      data: {
        senderId: senderToUse,
        providerId,
        subject: `Thread sospechoso ${i}`,
        status: "COMPLETED",
        workflow_phase: "CLOSED",
        closure_outcome: "BILATERAL",
        createdAt: new Date(),
        completedAt: new Date(Date.now() + 5 * 60 * 1000),
        confirmedByRequesterAt: new Date(Date.now() + 5 * 60 * 1000),
        confirmedByProviderAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await prisma.quoteMessage.create({
      data: {
        threadId: thread.id,
        authorId: senderToUse,
        authorRole: "client",
        body: "Solo un mensaje",
      },
    });
    await prisma.requestEvent.create({
      data: {
        requestId: thread.id,
        eventType: "COMPLETION_CONFIRMED",
        idempotencyKey: `risk-integration-completion-${thread.id}`,
      },
    });
  }

  await analyzeProviderRisk(providerId);

  const reportAfterSuspicious = await prisma.riskReport.findFirst({
    where: { providerId, status: "OPEN" },
    orderBy: { generatedAt: "desc" },
  });

  check("Thread sospechoso genera RiskReport", Boolean(reportAfterSuspicious));
  check("RiskReport tiene score ≥70", reportAfterSuspicious ? reportAfterSuspicious.riskScore >= 70 : false);
  check("RiskReport status = OPEN", reportAfterSuspicious?.status === "OPEN");
  const evidence = reportAfterSuspicious
    ? await prisma.riskSignalEvidence.findMany({ where: { riskReportId: reportAfterSuspicious.id } })
    : [];
  check("Evidencia conserva eventos fuente", evidence.some((item) =>
    Array.isArray(item.sourceEventIds) && item.sourceEventIds.length > 0
  ));

  console.log("\n--- Test 3: Sin duplicados en 24h ---");

  await analyzeProviderRisk(providerId);

  const allReports = await prisma.riskReport.findMany({
    where: { providerId, status: "OPEN" },
    orderBy: { generatedAt: "desc" },
  });

  check("Solo un RiskReport OPEN después de múltiples análisis", allReports.length === 1);

  console.log("\n--- Resumen ---");
  console.log(`✅ Tests pasados: ${passed}`);
  console.log(`❌ Tests fallados: ${failed}`);

  // Cleanup: remove temporary test user and related data
  await prisma.quoteThread.deleteMany({ 
    where: { senderId: newUser.id } 
  });
  await prisma.user.deleteMany({ 
    where: { email: "newaccount@risk-test.temp" } 
  });

  if (failed > 0) {
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error en tests:", err);
  process.exit(1);
});
