import assert from "node:assert/strict";
import { PrismaClient, Availability, LegacyCity } from "@prisma/client";
import { recalculateProviderTrustScore } from "../src/lib/trust-score-service";
import bcrypt from "bcryptjs";

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
  const secondSuperEmail = `${PREFIX}superadmin@conecta.test`;
  const secondSuper = await prisma.user.create({
    data: {
      email: secondSuperEmail,
      name: "Sprint 9 Second Super Admin",
      role: "SUPER_ADMIN",
      password: await bcrypt.hash(PASSWORD, 10),
      emailVerified: new Date(),
    },
  });
  const secondSuperSession = await login(secondSuperEmail);
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
      riskLineageRootId: undefined,
    },
  });
  await prisma.provider.update({ where: { id: provider.id }, data: { riskLineageRootId: provider.id } });

  const approvalIds: string[] = [];
  let relatedProviderSlug: string | null = null;
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
    assert.equal("sourceEventIds" in (dto.signalEvidence[0] ?? {}), false);

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
      body: JSON.stringify({ action: "SUSPEND", reason: "Señal confirmada para prueba Sprint 9", riskReportId: report.id }),
    });
    assert.equal(approvalRequest.response.status, 202);
    const approvalId = approvalRequest.body.data.id as string;
    approvalIds.push(approvalId);

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
    const resolvedReport = await prisma.riskReport.findUnique({ where: { id: report.id } });
    assert.equal(resolvedReport?.status, "ACTION_TAKEN");
    assert.equal(await prisma.reputationEvent.count({ where: { riskReportId: report.id } }), 1);
    const snapshotsAfterAction = await prisma.trustScoreSnapshot.count({ where: { providerId: provider.id } });
    await request(`/api/admin/risk-reports/${report.id}/status`, superAdmin.cookie, {
      method: "PATCH",
      body: JSON.stringify({ status: "ACTION_TAKEN", reason: "Intento duplicado Sprint 9" }),
    }).then((duplicate) => assert.equal(duplicate.response.status, 409));
    assert.equal(await prisma.reputationEvent.count({ where: { riskReportId: report.id } }), 1);
    assert.equal(await prisma.trustScoreSnapshot.count({ where: { providerId: provider.id } }), snapshotsAfterAction);

    await prisma.provider.update({ where: { id: provider.id }, data: { status: "ACTIVE" } });
    const expiredRequest = await request(`/api/admin/providers/${provider.id}/moderation-approvals`, admin.cookie, {
      method: "POST",
      body: JSON.stringify({ action: "SUSPEND", reason: "Solicitud expirada Sprint 9" }),
    });
    assert.equal(expiredRequest.response.status, 202);
    const expiredApprovalId = expiredRequest.body.data.id as string;
    approvalIds.push(expiredApprovalId);
    await prisma.moderationActionApproval.update({
      where: { id: expiredApprovalId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await request(`/api/admin/moderation-approvals/${expiredApprovalId}/approve`, superAdmin.cookie, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(expired.response.status, 409);
    assert.equal((await prisma.moderationActionApproval.findUnique({ where: { id: expiredApprovalId } }))?.status, "EXPIRED");

    const concurrentRequest = await request(`/api/admin/providers/${provider.id}/moderation-approvals`, admin.cookie, {
      method: "POST",
      body: JSON.stringify({ action: "SUSPEND", reason: "Solicitud concurrente Sprint 9" }),
    });
    assert.equal(concurrentRequest.response.status, 202);
    const concurrentApprovalId = concurrentRequest.body.data.id as string;
    approvalIds.push(concurrentApprovalId);
    const concurrent = await Promise.all([
      request(`/api/admin/moderation-approvals/${concurrentApprovalId}/approve`, superAdmin.cookie, { method: "POST", body: JSON.stringify({}) }),
      request(`/api/admin/moderation-approvals/${concurrentApprovalId}/approve`, secondSuperSession.cookie, { method: "POST", body: JSON.stringify({}) }),
    ]);
    assert.equal(concurrent.filter((result) => result.response.status === 200).length, 1);
    assert.equal(concurrent.filter((result) => result.response.status === 409).length, 1);

    relatedProviderSlug = `${PREFIX}related-provider`;
    const relatedProvider = await prisma.provider.create({
      data: {
        userId: providerUser.userId,
        displayName: "Sprint 9 Related Provider",
        slug: relatedProviderSlug,
        city: LegacyCity.MANAGUA,
        category: "Marketing Digital",
        mainCategory: "Marketing Digital",
        aboutDescription: "Perfil relacionado para validar linaje persistente de riesgo.",
        status: "ACTIVE",
        riskLineageRootId: provider.id,
      },
    });
    await prisma.provider.update({ where: { id: provider.id }, data: { status: "BANNED" } });
    const { extractProviderMetrics } = await import("../src/lib/risk-telemetry-service");
    assert.equal((await extractProviderMetrics(relatedProvider.id)).profileRecreationScore, 100);

    console.log("SPRINT9_RISK_E2E_OK");
  } finally {
    await prisma.moderationActionApproval.deleteMany({ where: { id: { in: approvalIds } } });
    if (relatedProviderSlug) await prisma.provider.deleteMany({ where: { slug: relatedProviderSlug } });
    await prisma.riskReport.deleteMany({ where: { providerId: provider.id } });
    await prisma.providerMetrics.deleteMany({ where: { providerId: provider.id } });
    await prisma.provider.delete({ where: { id: provider.id } });
    await prisma.user.delete({ where: { id: secondSuper.id } });
    await prisma.$disconnect();
  }
}

await main();
