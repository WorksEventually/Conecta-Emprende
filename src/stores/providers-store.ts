import { create } from "zustand";
import { seedOffers, seedProviders, seedReviews } from "../lib/mvp-data";
import type { SearchIntent } from "../lib/ai/extract-intent";

export interface ProviderSearchResult {
  id: string;
  userId: string;
  displayName: string;
  slug: string;
  city: string;
  mainCategory: string | null;
  category: string;
  shortDescription: string | null;
  priceRange: string | null;
  availability: string;
  status: string;
  statusReason: string | null;
  suspendedUntil: string | null;
  verified: boolean;
  verificationLevel: string | null;
  formalizationStatus: string;
  trustScore: number | null;
  responseTimeHrs: number | null;
  completedRequests: number;
  photos: string[];
  lat: number | null;
  lng: number | null;
  finalScore?: number;
}

export interface FullProvider {
  provider: any;
  catalogItems: any[];
  photos: any[];
  medals: any[];
  reviews: any[];
  averageReviewScore: number | null;
  completedRequestsCount: number;
}

interface ProvidersState {
  providers: ProviderSearchResult[];
  currentProvider: FullProvider | null;
  isLoading: boolean;
  error: string | null;
  aiUsed: boolean;
  aiIntent: SearchIntent | null;

  searchProviders: (params: { q?: string; city?: string }) => Promise<void>;
  searchProvidersAI: (params: { query: string; signal?: AbortSignal }) => Promise<void>;
  getProvider: (idOrSlug: string) => Promise<FullProvider | null>;
  clearCurrentProvider: () => void;
  patchIntent: (patch: Partial<Pick<SearchIntent, "category" | "city" | "maxPriceNIO" | "urgency">>) => void;
}

function getLocalProviderFallback(idOrSlug: string): FullProvider | null {
  const provider = seedProviders.find(item => item.id === idOrSlug);
  if (!provider) return null;

  const catalogItems = seedOffers
    .filter(item => item.providerId === provider.id)
    .map(item => ({
      id: item.id,
      providerId: item.providerId,
      title: item.name,
      itemType: item.type,
      category: item.category,
      description: item.fullDescription,
      priceMin: null,
      priceMax: null,
      currency: "NIO",
      priceUnit: null,
      city: item.cityCoverage[0] ?? provider.city,
      availabilityStatus: item.status === "ACTIVE" ? "DISPONIBLE" : "NO_DISPONIBLE_TEMPORALMENTE",
      mainImageUrl: item.imageUrls[0] ?? null,
      viewCount: item.viewCount,
      inquiryCount: item.inquiryCount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

  const reviews = seedReviews.filter(item => item.providerId === provider.id).map(item => ({
    id: item.id,
    providerId: item.providerId,
    reviewerId: item.reviewerId,
    generalScore: item.score,
    comment: item.text,
    createdAt: item.createdAt,
  }));

  return {
    provider: {
      id: provider.id,
      userId: provider.ownerUserId,
      displayName: provider.publicName,
      slug: provider.id,
      bio: provider.description,
      logoUrl: provider.avatarUrl ?? null,
      coverImageUrl: provider.coverImageUrl ?? provider.portfolioImages[0] ?? null,
      city: provider.city,
      serviceRadius: provider.serviceArea[0] ?? provider.city,
      category: provider.category,
      mainCategory: provider.category,
      shortDescription: provider.tagline ?? provider.description,
      aboutDescription: provider.description,
      priceRange: provider.priceRange,
      availability: provider.availability === "AVAILABLE" ? "DISPONIBLE" : provider.availability === "BUSY" ? "OCUPADO" : "NO_DISPONIBLE_TEMPORALMENTE",
      verified: provider.verificationLevel === "COMPLETE",
      verificationLevel: provider.verificationLevel,
      formalizationStatus: provider.formalizationStatus,
      trustScore: provider.trustScore,
      responseTimeHrs: provider.responseTimeHrs,
      completedRequests: provider.completedRequests,
      profileCompleteness: provider.profileCompleteness,
      lat: provider.lat,
      lng: provider.lng,
    },
    catalogItems,
    photos: provider.portfolioImages.map((imageUrl, index) => ({ id: `${provider.id}-photo-${index}`, providerId: provider.id, imageUrl, isFeatured: index === 0 })),
    medals: provider.medals.map((medal, index) => ({ id: `${provider.id}-medal-${index}`, medalType: medal })),
    reviews,
    averageReviewScore: provider.avgRating ?? null,
    completedRequestsCount: provider.completedRequests,
  };
}

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  providers: [],
  currentProvider: null,
  isLoading: false,
  error: null,
  aiUsed: false,
  aiIntent: null,

  searchProviders: async ({ q, city }) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (city) params.set("city", city);

      const res = await fetch(`/api/providers/search?${params}`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al buscar proveedores");
      }

      set({ providers: data.data, isLoading: false, aiUsed: false, aiIntent: null });
    } catch (error) {
      console.error("searchProviders error:", error);
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  searchProvidersAI: async ({ query, signal }) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/providers/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        credentials: "include",
        signal,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error en búsqueda IA");
      }

      set({
        providers: data.data,
        isLoading: false,
        aiUsed: data.usedAi ?? true,
        aiIntent: data.intent ?? null,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        set({ isLoading: false });
        return;
      }
      console.error("searchProvidersAI error:", error);
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  getProvider: async (idOrSlug) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(idOrSlug)}`, {
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const fallback = getLocalProviderFallback(idOrSlug);
        set({ currentProvider: fallback, isLoading: false });
        return fallback;
      }

      set({ currentProvider: data.data, isLoading: false });
      return data.data;
    } catch (error) {
      console.error("getProvider error:", error);
      const fallback = getLocalProviderFallback(idOrSlug);
      set({ currentProvider: fallback, error: fallback ? null : (error as Error).message, isLoading: false });
      return fallback;
    }
  },

  clearCurrentProvider: () => set({ currentProvider: null }),

  patchIntent: (patch) => {
    const current = get().aiIntent;
    if (!current) return;
    const next = { ...current, ...patch };
    const count = [next.category, next.city, next.maxPriceNIO != null, next.urgency].filter(Boolean).length;
    next.confidence = count >= 3 ? "alta" : count >= 2 ? "media" : "baja";
    set({ aiIntent: next });
  },
}));
