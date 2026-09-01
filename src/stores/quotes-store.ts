import { create } from "zustand";

export interface QuoteMessage {
  id: string;
  author: string;
  text: string;
  time: string;
}

export interface QuoteThread {
  id: string;
  senderId: string;
  providerId: string;
  catalogItemId: string | null;
  subject: string;
  clientName: string | null;
  clientAvatar: string | null;
  dateLabel: string | null;
  status: string;
  workflow_phase?: string;
  closure_outcome?: string | null;
  moderation_state?: string;
  completionDeadline?: string | null;
  quotedPriceLabel: string | null;
  quotedDeliveryTime: string | null;
  quotationHistory?: Array<{
    price?: string | null;
    delivery?: string | null;
    providerId?: string;
    timestamp?: string;
  }>;
  acceptedQuotation?: {
    price?: string | null;
    delivery?: string | null;
    acceptedAt: string;
    acceptedBy: string;
  } | null;
  confirmedByRequesterAt: string | null;
  confirmedByProviderAt: string | null;
  completedAt: string | null;
  createdAt: string;
  messages: QuoteMessage[];
  providerDisplayName?: string;
  providerSlug?: string;
}

interface QuotesState {
  threads: QuoteThread[];
  currentThread: QuoteThread | null;
  isLoading: boolean;
  error: string | null;

  fetchMyThreads: () => Promise<void>;
  fetchThreadsByProvider: (providerId: string) => Promise<void>;
  fetchThreadsBySender: (senderId: string) => Promise<void>;
  getThread: (threadId: string) => Promise<QuoteThread | null>;
  addMessage: (threadId: string, text: string) => Promise<void>;
  updateThread: (threadId: string, data: Record<string, any>) => Promise<void>;
  createThread: (data: {
    providerId: string;
    subject: string;
    body: string;
    catalogItemId?: string;
  }) => Promise<QuoteThread | null>;
  clearCurrentThread: () => void;
  clearThreads: () => void;
}

export const useQuotesStore = create<QuotesState>((set, get) => ({
  threads: [],
  currentThread: null,
  isLoading: false,
  error: null,

  fetchMyThreads: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/quotes", {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al obtener conversaciones");
      }

      set({ threads: data.data, isLoading: false });
    } catch (error) {
      console.error("fetchMyThreads error:", error);
      set({ threads: [], error: (error as Error).message, isLoading: false });
    }
  },

  fetchThreadsByProvider: async (providerId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/quotes?providerId=${encodeURIComponent(providerId)}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al obtener conversaciones");
      }

      set({ threads: data.data, isLoading: false });
    } catch (error) {
      console.error("fetchThreadsByProvider error:", error);
      set({ threads: [], error: (error as Error).message, isLoading: false });
    }
  },

  fetchThreadsBySender: async (senderId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/quotes?senderId=${encodeURIComponent(senderId)}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al obtener conversaciones");
      }

      set({ threads: data.data, isLoading: false });
    } catch (error) {
      console.error("fetchThreadsBySender error:", error);
      set({ threads: [], error: (error as Error).message, isLoading: false });
    }
  },

  getThread: async (threadId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(threadId)}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        set({ currentThread: null, isLoading: false });
        return null;
      }

      set(state => ({
        currentThread: data.data,
        threads: state.threads.some(thread => thread.id === data.data.id)
          ? state.threads.map(thread => thread.id === data.data.id ? data.data : thread)
          : state.threads,
        isLoading: false,
      }));
      return data.data;
    } catch (error) {
      console.error("getThread error:", error);
      set({ error: (error as Error).message, isLoading: false });
      return null;
    }
  },

  addMessage: async (threadId, text) => {
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(threadId)}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al enviar mensaje");
      }

      // Refresh current thread to get updated messages
      await get().getThread(threadId);
    } catch (error) {
      console.error("addMessage error:", error);
      throw error;
    }
  },

  updateThread: async (threadId, updateData) => {
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(threadId)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al actualizar conversación");
      }

      // Refresh thread data
      await get().getThread(threadId);
    } catch (error) {
      console.error("updateThread error:", error);
      throw error;
    }
  },

  createThread: async ({ providerId, subject, body, catalogItemId }) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, subject, body, catalogItemId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error al crear conversación");
      }

      set(state => ({
        threads: [data.data, ...state.threads.filter(thread => thread.id !== data.data.id)],
        isLoading: false,
      }));
      return data.data;
    } catch (error) {
      console.error("createThread error:", error);
      set({ error: (error as Error).message, isLoading: false });
      return null;
    }
  },

  clearCurrentThread: () => set({ currentThread: null }),
  clearThreads: () => set({ threads: [], currentThread: null, error: null, isLoading: false }),
}));
