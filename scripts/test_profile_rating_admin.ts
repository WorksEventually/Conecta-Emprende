import assert from "node:assert/strict";
import { calculateAverageRating } from "../src/domain/rating/calculateAverageRating";
import { calculateTrustScoreV2 } from "../src/domain/rating/calculateTrustScoreV2";
import { calculateRiskScore } from "../src/domain/risk/calculateRiskScore";
import { validateVerifiedReview } from "../src/domain/requests/reviewRules";
import { seedProviders, seedRequests, seedRoleAssignments } from "../src/lib/mvp-data";
import type { ProviderRequest, VerifiedReview } from "../src/lib/identity";

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

const completedRequest:ProviderRequest = {
  id:"request-ok",
  requesterUserId:"user-client",
  requesterProfileId:"client-profile-1",
  requesterProviderProfileId:null,
  targetProviderProfileId:"provider-2",
  catalogItemId:null,
  title:"Trabajo completado",
  description:"Solicitud verificada",
  status:"COMPLETED",
  confirmedByRequesterAt:"2026-07-01T10:00:00.000Z",
  confirmedByProviderAt:"2026-07-01T11:00:00.000Z",
  completedAt:"2026-07-01T11:00:00.000Z",
  createdAt:"2026-06-30T10:00:00.000Z",
};

const validReview:Pick<VerifiedReview,"reviewerUserId"|"reviewedProviderProfileId"|"requestId"> = {
  requestId:"request-ok",
  reviewerUserId:"user-client",
  reviewedProviderProfileId:"provider-2",
};

assert.deepEqual(validateVerifiedReview({
  request:completedRequest,
  review:validReview,
  existingReviews:[],
  reviewedProviderOwnerUserId:"user-2",
}),{valid:true});

assert.equal(validateVerifiedReview({
  request:{...completedRequest,status:"OPEN"},
  review:validReview,
  existingReviews:[],
  reviewedProviderOwnerUserId:"user-2",
}).valid,false);

const selfReviewResult = validateVerifiedReview({
  request:{...completedRequest,requesterUserId:"user-2"},
  review:{...validReview,reviewerUserId:"user-2"},
  existingReviews:[],
  reviewedProviderOwnerUserId:"user-2",
});
assert.equal(selfReviewResult.valid,false);
if(!selfReviewResult.valid)assert.equal(selfReviewResult.reason,"SELF_REVIEW_NOT_ALLOWED");

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
