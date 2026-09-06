import assert from "node:assert/strict";
import { PrismaClient, Availability, LegacyCity } from "@prisma/client";
import { recalculateProviderTrustScore } from "../src/lib/trust-score-service";

const prisma = new PrismaClient();
const BASE_URL = process.env.API_URL ?? "http://localhost:3000";
const PREFIX = `sprint9-risk-${Date.now()}-`;
const PASSWORD = "Conecta123!";

async function login(email: string) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  const access = cookies.find((cookie) => cookie.startsWith("access_token="));
  const refresh = cookies.find((cookie) => cookie.startsWith("refresh_token="));
  assert.ok(access && refresh);
  return {
    cookie: `${access.split(";")[0]}; ${refresh.split(";")[0]}`,
    userId: (await response.json()).data.user.id as string,
  };
}

async function request(path: string, cookie: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

async function main() {
  const admin = await login("admin@conecta.test");
  const superAdmin = await login("superadmin@conecta.test");
  const providerUser = await login("textil@conecta.test");
  const provider = await prisma.provider.create({
    data: {
      userId: providerUser.userId,
      displayName: "Sprint 9 Risk Provider",
      slug: `${PREFIX}provider`,
      city: LegacyCity.MANAGUA,
      category: "Marketing Digital",
      mainCategory: "Marketing Digital",
      aboutDescription: "Proveedor temporal para validar el circuito de riesgo del Sprint 9.",
      shortDescription: "Proveedor temporal Sprint 9",
      availability: Availability.DISPONIBLE,
      status: "ACTIVE",
    },
  });

  let approvalId: string | null = null;
  try {
    const report = await prisma.riskReport.create({
      data: {
        providerId: provider.id,
        riskScore: 85,
        riskLevel: "high-risk",
        penalty: 40,
        algorithmVersion: "risk-v1.0.0",
        status: "OPEN",
        recommendedAction: "Revisión manual",
      },
    });

    await recalculateProviderTrustScore(provider.id);
    const heldMetrics = await prisma.providerMetrics.findUnique({ where: { providerId: provider.id } });
    assert.equal(heldMetrics?.growthHold, true);

    const list = await request("/api/admin/risk-reports", admin.cookie);
    assert.equal(list.response.status, 200);
    const dto = list.body.data.find((item: any) => item.id === report.id);
    assert.ok(dto);
    assert.equal(dto.signals !== undefined, true);
    assert.equal("messages" in dto, false);
    assert.equal("chat" in dto, false);
    assert.equal("phone" in dto, false);
    assert.ok(Array.isArray(dto.signalEvidence));

    const dismissed = await request(`/api/admin/risk-reports/${report.id}/status`, admin.cookie, {
      method: "PATCH",
      body: JSON.stringify({ status: "DISMISSED", reason: "No se confirmó actividad indebida" }),
    });
    assert.equal(dismissed.response.status, 200);
    const releasedMetrics = await prisma.providerMetrics.findUnique({ where: { providerId: provider.id } });
    assert.equal(releasedMetrics?.growthHold, false);

    await prisma.riskReport.update({ where: { id: report.id }, data: { status: "OPEN" } });
    await recalculateProviderTrustScore(provider.id);

    const approvalRequest = await request(`/api/admin/providers/${provider.id}/moderation-approvals`, admin.cookie, {
      method: "POST",
      body: JSON.stringify({ action: "SUSPEND", reason: "Señal confirmada para prueba Sprint 9" }),
    });
    assert.equal(approvalRequest.response.status, 202);
    approvalId = approvalRequest.body.data.id;

    const selfApproval = await request(`/api/admin/moderation-approvals/${approvalId}/approve`, admin.cookie, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(selfApproval.response.status, 403);

    const approved = await request(`/api/admin/moderation-approvals/${approvalId}/approve`, superAdmin.cookie, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(approved.response.status, 200);
    const updatedProvider = await prisma.provider.findUnique({ where: { id: provider.id } });
    assert.equal(updatedProvider?.status, "SUSPENDED");

    console.log("SPRINT9_RISK_E2E_OK");
  } finally {
    if (approvalId) await prisma.moderationActionApproval.deleteMany({ where: { id: approvalId } });
    await prisma.riskReport.deleteMany({ where: { providerId: provider.id } });
    await prisma.providerMetrics.deleteMany({ where: { providerId: provider.id } });
    await prisma.provider.delete({ where: { id: provider.id } });
    await prisma.$disconnect();
  }
}

await main();
