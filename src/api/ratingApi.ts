import { apiRequest } from "./http";

export interface ServerReview {
  id: string;
  requestId: string | null;
  reviewerId: string;
  providerId: string;
  qualityScore: number;
  responseTimeScore: number;
  fulfillmentScore: number;
  communicationScore: number;
  valueScore: number;
  generalScore: number;
  comment: string | null;
  weight: number;
  editedAt: string | null;
  createdAt: string;
}

export const ratingApi = {
  getProviderRating:(providerProfileId:string)=>apiRequest<{avgRating:number|null;totalVerifiedReviews:number}>(`/api/providers/${encodeURIComponent(providerProfileId)}/rating`),
  getTrustScore:(providerProfileId:string)=>apiRequest<{trustScore:number|null}>(`/api/providers/${encodeURIComponent(providerProfileId)}/trust-score`),
  getVerifiedReviews:(providerProfileId:string)=>apiRequest<ServerReview[]>(`/api/providers/${encodeURIComponent(providerProfileId)}/reviews`),
  updateReview:(reviewId:string, data:{qualityScore:number;responseTimeScore?:number;fulfillmentScore?:number;communicationScore?:number;valueScore?:number;comment?:string}) =>
    apiRequest<ServerReview>(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: "PATCH", body: JSON.stringify(data) }),
};
