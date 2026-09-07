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
  let lineageUserId: string | null = null;
  let concurrentLineageUserId: string | null = null;
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

    // HTML date inputs submit YYYY-MM-DD. The API must normalize that value
    // before persisting a DateTime approval request.
    const approvalRequest = await request(`/api/admin/providers/${provider.id}/moderation-approvals`, admin.cookie, {
      method: "POST",
      body: JSON.stringify({
        action: "SUSPEND",
        reason: "Señal confirmada para prueba Sprint 9",
        suspendedUntil: "2099-12-31",
        riskReportId: report.id,
      }),
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
    assert.equal(updatedProvider?.suspendedUntil?.toISOString(), "2099-12-31T23:59:59.999Z");
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

    await prisma.provider.update({ where: { id: provider.id }, data: { status: "ACTIVE", suspendedUntil: null } });
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

    // Listing is the system sweep: it must expire stale requests and record
    // the action without pretending a human admin performed it.
    const pendingApprovals = await request("/api/admin/moderation-approvals", admin.cookie);
    assert.equal(pendingApprovals.response.status, 200);
    assert.equal(pendingApprovals.body.data.some((approval: any) => approval.id === expiredApprovalId), false);
    assert.equal((await prisma.moderationActionApproval.findUnique({ where: { id: expiredApprovalId } }))?.status, "EXPIRED");
    const expirationAudit = await prisma.moderationAuditLog.findFirst({
      where: {
        action: "MODERATION_APPROVAL_EXPIRED",
        targetId: provider.id,
        actorUserId: null,
      },
      orderBy: { createdAt: "desc" },
    });
    assert.equal((expirationAudit?.metadata as any)?.expirationMode, "SYSTEM_SWEEP");
    assert.equal((expirationAudit?.metadata as any)?.actorType, "SYSTEM");

    const expired = await request(`/api/admin/moderation-approvals/${expiredApprovalId}/approve`, superAdmin.cookie, {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(expired.response.status, 409);

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

    // The association is created by the production HTTP route, not by a
    // direct Prisma fixture. Multiple profiles under the same account share
    // a lineage root before an eventual moderation decision is applied.
    const lineageEmail = `${PREFIX}lineage@conecta.test`;
    const lineageUser = await prisma.user.create({
      data: {
        email: lineageEmail,
        name: "Sprint 9 Lineage User",
        password: await bcrypt.hash(PASSWORD, 10),
        emailVerified: new Date(),
      },
    });
    lineageUserId = lineageUser.id;
    const lineageSession = await login(lineageEmail);
    const lineagePayload = (displayName: string) => ({
      displayName,
      category: "Marketing Digital",
      mainCategory: "Marketing Digital",
      shortDescription: "Perfil temporal para validar linaje de riesgo.",
      aboutDescription: "Perfil temporal creado mediante la ruta HTTP para validar el linaje persistente de perfiles relacionados.",
    });
    const lineageRootResponse = await request("/api/providers", lineageSession.cookie, {
      method: "POST",
      body: JSON.stringify(lineagePayload(`${PREFIX}Root profile`)),
    });
    assert.equal(lineageRootResponse.response.status, 201);
    const lineageRootId = lineageRootResponse.body.data.id as string;

    const lineageMemberResponse = await request("/api/providers", lineageSession.cookie, {
      method: "POST",
      body: JSON.stringify(lineagePayload(`${PREFIX}Related profile`)),
    });
    assert.equal(lineageMemberResponse.response.status, 201);
    const lineageMemberId = lineageMemberResponse.body.data.id as string;

    const lineageProfiles = await prisma.provider.findMany({
      where: { id: { in: [lineageRootId, lineageMemberId] } },
      select: { id: true, riskLineageRootId: true },
    });
    assert.equal(lineageProfiles.length, 2);
    assert.equal(lineageProfiles.every((profile) => profile.riskLineageRootId === lineageRootId), true);

    await prisma.provider.update({ where: { id: lineageRootId }, data: { status: "BANNED" } });
    const { extractProviderMetrics } = await import("../src/lib/risk-telemetry-service");
    assert.equal((await extractProviderMetrics(lineageMemberId)).profileRecreationScore, 100);

    // Two first-profile requests issued at the same time must serialize on the
    // owner row and converge on a single lineage root.
    const concurrentLineageEmail = `${PREFIX}concurrent-lineage@conecta.test`;
    const concurrentLineageUser = await prisma.user.create({
      data: {
        email: concurrentLineageEmail,
        name: "Sprint 9 Concurrent Lineage User",
        password: await bcrypt.hash(PASSWORD, 10),
        emailVerified: new Date(),
      },
    });
    concurrentLineageUserId = concurrentLineageUser.id;
    const concurrentLineageSession = await login(concurrentLineageEmail);
    const concurrentCreates = await Promise.all([
      request("/api/providers", concurrentLineageSession.cookie, {
        method: "POST",
        body: JSON.stringify(lineagePayload(`${PREFIX}Concurrent root profile`)),
      }),
      request("/api/providers", concurrentLineageSession.cookie, {
        method: "POST",
        body: JSON.stringify(lineagePayload(`${PREFIX}Concurrent related profile`)),
      }),
    ]);
    assert.equal(concurrentCreates.every((result) => result.response.status === 201), true);
    const concurrentProviderIds = concurrentCreates.map((result) => result.body.data.id as string);
    const concurrentProfiles = await prisma.provider.findMany({
      where: { id: { in: concurrentProviderIds } },
      select: { riskLineageRootId: true },
    });
    assert.equal(concurrentProfiles.length, 2);
    assert.equal(concurrentProfiles.every((profile) => Boolean(profile.riskLineageRootId)), true);
    assert.equal(new Set(concurrentProfiles.map((profile) => profile.riskLineageRootId)).size, 1);

    console.log("SPRINT9_RISK_E2E_OK");
  } finally {
    await prisma.moderationActionApproval.deleteMany({ where: { id: { in: approvalIds } } });
    if (lineageUserId) await prisma.user.delete({ where: { id: lineageUserId } });
    if (concurrentLineageUserId) await prisma.user.delete({ where: { id: concurrentLineageUserId } });
    await prisma.riskReport.deleteMany({ where: { providerId: provider.id } });
    await prisma.providerMetrics.deleteMany({ where: { providerId: provider.id } });
    await prisma.provider.delete({ where: { id: provider.id } });
    await prisma.user.delete({ where: { id: secondSuper.id } });
    await prisma.$disconnect();
  }
}

await main();
