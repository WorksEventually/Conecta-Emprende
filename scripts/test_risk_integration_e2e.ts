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
const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

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
  opts: { cookie?: string; body?: unknown } = {},
): Promise<{ status: number; body: any; cookie: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const rawCookies: string[] =
    (res.headers as any).getSetCookie?.() ?? (res.headers.get("set-cookie")?.split(",") ?? []);
  const cookie = rawCookies.map((value) => value.split(";")[0]).join("; ");
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

async function main() {
  console.log("→ Risk Telemetry Integration Tests (E2E)\n");

  const requester = await login("requester@conecta.test");
  const provider = await login("textil@conecta.test");
  const providerRecord = await prisma.provider.findFirst({ where: { userId: provider.userId } });
  if (!providerRecord) throw new Error("Provider not found");
  const providerId = providerRecord.id;

  check("Requester + Provider login", Boolean(requester.cookie && provider.cookie));

  // Clean up temporary user if it exists from a previous failed run.
  await prisma.quoteThread.deleteMany({
    where: { sender: { email: "newaccount@risk-test.temp" } },
  });
  await prisma.user.deleteMany({
    where: { email: "newaccount@risk-test.temp" },
  });

  const newUser = await prisma.user.create({
    data: {
      email: "newaccount@risk-test.temp",
      name: "New Account Test",
      password: await bcrypt.hash(SEED_PASSWORD, 10),
      createdAt: new Date(),
    },
  });

  // The seeded provider already exhibits an anomalous aggregate. Clean the
  // provider state so each scenario controls its own risk inputs.
  await prisma.quoteThread.deleteMany({ where: { providerId } });
  await prisma.review.deleteMany({ where: { providerId } });
  await prisma.riskReport.deleteMany({ where: { providerId } });

  console.log("\n--- Test 1: Thread normal no genera RiskReport ---");

  const normalCreatedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const normalCompletedAt = new Date(Date.now() - 60 * 60 * 1000);
  const normalThread = await prisma.quoteThread.create({
    data: {
      senderId: requester.userId,
      providerId,
      subject: "Thread normal",
      status: "COMPLETED",
      workflow_phase: "CLOSED",
      closure_outcome: "BILATERAL",
      createdAt: normalCreatedAt,
      completedAt: normalCompletedAt,
      confirmedByRequesterAt: normalCompletedAt,
      confirmedByProviderAt: normalCompletedAt,
    },
  });

  await prisma.quoteMessage.createMany({
    data: [
      {
        threadId: normalThread.id,
        authorId: requester.userId,
        authorRole: "client",
        body: "Mensaje 1",
        createdAt: new Date(normalCreatedAt.getTime() + 10 * 60 * 1000),
      },
      {
        threadId: normalThread.id,
        authorId: provider.userId,
        authorRole: "provider",
        body: "Mensaje 2",
        createdAt: new Date(normalCreatedAt.getTime() + 20 * 60 * 1000),
      },
    ],
  });

  const { analyzeProviderRisk } = await import("../src/lib/risk-telemetry-service");
  await analyzeProviderRisk(providerId);

  const reportAfterNormal = await prisma.riskReport.findFirst({
    where: { providerId, status: "OPEN" },
    orderBy: { generatedAt: "desc" },
  });

  check("Thread normal no genera RiskReport", !reportAfterNormal);

  console.log("\n--- Test 2: Actividad fuera de 30 días no puntúa ni deja evidencia actual ---");

  await prisma.quoteThread.deleteMany({ where: { providerId } });
  await prisma.riskReport.deleteMany({ where: { providerId } });

  const oldEventIds: string[] = [];
  const oldThreadIds: string[] = [];
  const oldBase = new Date(Date.now() - THIRTY_ONE_DAYS_MS);
  for (let index = 0; index < 5; index += 1) {
    const oldCreatedAt = new Date(oldBase.getTime() + index * 60 * 1000);
    const oldCompletedAt = new Date(oldCreatedAt.getTime() + 5 * 60 * 1000);
    const senderId = index < 4 ? newUser.id : requester.userId;
    const thread = await prisma.quoteThread.create({
      data: {
        senderId,
        providerId,
        subject: `Thread histórico sospechoso ${index}`,
        status: "COMPLETED",
        workflow_phase: "CLOSED",
        closure_outcome: "BILATERAL",
        createdAt: oldCreatedAt,
        completedAt: oldCompletedAt,
        confirmedByRequesterAt: oldCompletedAt,
        confirmedByProviderAt: oldCompletedAt,
      },
    });
    oldThreadIds.push(thread.id);

    await prisma.quoteMessage.create({
      data: {
        threadId: thread.id,
        authorId: senderId,
        authorRole: "client",
        body: "Solo un mensaje histórico",
        createdAt: oldCreatedAt,
      },
    });
    const event = await prisma.requestEvent.create({
      data: {
        requestId: thread.id,
        eventType: "COMPLETION_CONFIRMED",
        idempotencyKey: `risk-integration-old-${thread.id}`,
        occurredAt: oldCompletedAt,
        createdAt: oldCompletedAt,
      },
    });
    oldEventIds.push(event.id);
  }

  await analyzeProviderRisk(providerId);
  const reportAfterHistoricalActivity = await prisma.riskReport.findFirst({
    where: { providerId, status: "OPEN" },
  });
  check("Actividad fuera de ventana no genera RiskReport", !reportAfterHistoricalActivity);

  console.log("\n--- Test 3: Actividad reciente sospechosa genera RiskReport ---");

  const suspiciousCreatedAt = new Date(Date.now() - 10 * 60 * 1000);
  const suspiciousCompletedAt = new Date(Date.now() - 5 * 60 * 1000);
  for (let index = 0; index < 5; index += 1) {
    const senderId = index < 4 ? newUser.id : requester.userId;
    const thread = await prisma.quoteThread.create({
      data: {
        senderId,
        providerId,
        subject: `Thread sospechoso reciente ${index}`,
        status: "COMPLETED",
        workflow_phase: "CLOSED",
        closure_outcome: "BILATERAL",
        createdAt: suspiciousCreatedAt,
        completedAt: suspiciousCompletedAt,
        confirmedByRequesterAt: suspiciousCompletedAt,
        confirmedByProviderAt: suspiciousCompletedAt,
      },
    });

    await prisma.quoteMessage.create({
      data: {
        threadId: thread.id,
        authorId: senderId,
        authorRole: "client",
        body: "Solo un mensaje",
        createdAt: suspiciousCreatedAt,
      },
    });
    await prisma.requestEvent.create({
      data: {
        requestId: thread.id,
        eventType: "COMPLETION_CONFIRMED",
        idempotencyKey: `risk-integration-completion-${thread.id}`,
        occurredAt: suspiciousCompletedAt,
        createdAt: suspiciousCompletedAt,
      },
    });
  }

  await analyzeProviderRisk(providerId);

  const reportAfterSuspicious = await prisma.riskReport.findFirst({
    where: { providerId, status: "OPEN" },
    orderBy: { generatedAt: "desc" },
  });

  check("Actividad reciente sospechosa genera RiskReport", Boolean(reportAfterSuspicious));
  check("RiskReport tiene score ≥70", reportAfterSuspicious ? reportAfterSuspicious.riskScore >= 70 : false);
  check("RiskReport status = OPEN", reportAfterSuspicious?.status === "OPEN");
  const evidence = reportAfterSuspicious
    ? await prisma.riskSignalEvidence.findMany({ where: { riskReportId: reportAfterSuspicious.id } })
    : [];
  check("Evidencia conserva eventos fuente recientes", evidence.some((item) =>
    Array.isArray(item.sourceEventIds) && item.sourceEventIds.length > 0,
  ));
  check("Evidencia no conserva eventos fuera de ventana", evidence.every((item) =>
    !Array.isArray(item.sourceEventIds)
      || !item.sourceEventIds.some((id) => oldEventIds.includes(String(id))),
  ));
  check("Evidencia no conserva registros fuera de ventana", evidence.every((item) =>
    !Array.isArray(item.sourceRecordIds)
      || !item.sourceRecordIds.some((id) => oldThreadIds.includes(String(id))),
  ));

  console.log("\n--- Test 4: Sin duplicados en 24h ---");

  await analyzeProviderRisk(providerId);

  const allReports = await prisma.riskReport.findMany({
    where: { providerId, status: "OPEN" },
    orderBy: { generatedAt: "desc" },
  });

  check("Solo un RiskReport OPEN después de múltiples análisis", allReports.length === 1);

  console.log("\n--- Resumen ---");
  console.log(`✅ Tests pasados: ${passed}`);
  console.log(`❌ Tests fallados: ${failed}`);

  await prisma.quoteThread.deleteMany({ where: { providerId } });
  await prisma.riskReport.deleteMany({ where: { providerId } });
  await prisma.user.deleteMany({ where: { email: "newaccount@risk-test.temp" } });
  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error en tests:", err);
  process.exit(1);
});
