import assert from "node:assert/strict";
import { calculateAverageRating } from "../src/domain/rating/calculateAverageRating";
import { calculateTrustScoreV2 } from "../src/domain/rating/calculateTrustScoreV2";
import { calculateRiskScore } from "../src/domain/risk/calculateRiskScore";
import { seedProviders, seedRequests, seedRoleAssignments } from "../src/lib/mvp-data";

const perfectProviderResult = calculateTrustScoreV2({
  hasBio: true,
  hasLogo: true,
  hasLocation: true,
  hasHours: true,
  emailVerified: true,
  phoneVerified: true,
  requestsResponded: 100,
  requestsIgnored: 0,
  bilateralCompletionsByRequester: new Map([
    ["req1", 1],
    ["req2", 1],
    ["req3", 1],
    ["req4", 1],
    ["req5", 1],
    ["req6", 1],
    ["req7", 1],
    ["req8", 1],
    ["req9", 1],
    ["req10", 1],
    ["req11", 1],
    ["req12", 1],
    ["req13", 1],
    ["req14", 1],
    ["req15", 1],
  ]),
  weightedReviews: Array.from({ length: 100 }, () => ({ score: 5, weight: 1.0 })),
  uniqueRequesters: 15,
  accountAgeDays: 365,
  responseTimeHrs: 12,
  suspiciousActivityPenalty: 0,
});
assert.equal(perfectProviderResult.internal_score, 100);
assert.ok(perfectProviderResult.public_score !== null);

const newProviderResult = calculateTrustScoreV2({
  hasBio: false,
  hasLogo: false,
  hasLocation: false,
  hasHours: false,
  emailVerified: false,
  phoneVerified: false,
  requestsResponded: 0,
  requestsIgnored: 0,
  bilateralCompletionsByRequester: new Map(),
  weightedReviews: [],
  uniqueRequesters: 0,
  accountAgeDays: 5,
  responseTimeHrs: null,
  suspiciousActivityPenalty: 30,
});
assert.ok(newProviderResult.internal_score <= 10);
assert.equal(newProviderResult.public_score, null);
assert.equal(newProviderResult.reason, "INSUFFICIENT_EVIDENCE");

assert.equal(calculateAverageRating([{score:5,verified:false},{score:4,verified:true}]),4);

assert.ok(seedProviders.some(provider=>provider.ownerUserId==="user-provider"));
assert.ok(seedRequests.some(request=>request.requesterId==="user-client"&&request.providerId!=="provider-1"),"A requester/provider-capable account can request another provider");
assert.ok(seedRoleAssignments.some(role=>role.role==="SUPER_ADMIN"&&role.userId==="user-provider"));
assert.ok(!seedRoleAssignments.some(role=>role.role==="SUPER_ADMIN"&&role.userId==="user-client"));

const risk = calculateRiskScore({
  avgSearchTimeSeconds:2,
  avgRequestToCompletionMinutes:5,
  avgMessagesPerRequest:1,
  newAccountsPercentage:100,
  repeatedTargetProviderScore:100,
  ratingConcentrationScore:100,
});
assert.ok(risk.score>=70);
assert.equal(risk.shouldGenerateReport,true);

console.log("PROFILE_RATING_ADMIN_CONTRACT_OK");
