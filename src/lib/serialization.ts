import { serializeIdentityData } from "./identity";
import type { ProviderOffer, ProviderProfile, QuoteRequest, Report, Review } from "./mvp-data";
import { useMvpStore } from "../stores/mvp-store";

export interface SerializedMarketplaceData {
  schemaVersion:1;
  exportedAt:string;
  identity:ReturnType<typeof serializeIdentityData>;
  providerProfiles:ProviderProfile[];
  offers:ProviderOffer[];
  requests:QuoteRequest[];
  reviews:Review[];
  reports:Report[];
  savedProviderIds:string[];
}

export function createMarketplaceSnapshot():SerializedMarketplaceData {
  const state=useMvpStore.getState();
  return {
    schemaVersion:1,
    exportedAt:new Date().toISOString(),
    identity:serializeIdentityData({accounts:state.accounts,clientProfiles:state.clientProfiles,roleAssignments:state.roleAssignments}),
    providerProfiles:state.providers,
    offers:state.offers,
    requests:state.requests,
    reviews:state.reviews,
    reports:state.reports,
    savedProviderIds:state.savedProviderIds,
  };
}

export const stringifyMarketplaceSnapshot=()=>JSON.stringify(createMarketplaceSnapshot());
