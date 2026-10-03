import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { ChatResponse } from "../api/orchestrator";

export type ChatEntry = {
  id: string;
  question: string;
  result: ChatResponse | { success: false; error: string; answer: "" };
  // Browser-measured round trip (network + cold start + server) for this request
  clientMs?: number;
  pendingInteractionId?: string;
  interactionKind?: "clarification" | "guidance";
};

export type PendingInteraction = { id: string; kind: "clarification" | "guidance" };

export type ChatConversation = {
  id: string;
  title: string;
  updatedAt: number;
  entries: ChatEntry[];
  pendingInteraction: PendingInteraction | null;
};

const MAX_CONVERSATIONS = 30;
const TITLE_MAX_LENGTH = 60;

function titleFrom(question: string): string {
  const trimmed = question.trim();
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH - 1)}…` : trimmed;
}

function keepMostRecent(conversations: Record<string, ChatConversation>): Record<string, ChatConversation> {
  const kept = Object.values(conversations)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
  return Object.fromEntries(kept.map((conversation) => [conversation.id, conversation]));
}

// Private mode or a full quota must not break the chat itself: the conversation still works for this visit.
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      return;
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      return;
    }
  },
};

interface ChatHistoryState {
  conversations: Record<string, ChatConversation>;
  startConversation: (id: string, question: string) => void;
  appendEntry: (id: string, entry: ChatEntry, pendingInteraction: PendingInteraction | null) => void;
  deleteConversation: (id: string) => void;
}

export const useChatHistory = create<ChatHistoryState>()(
  persist(
    (set) => ({
      conversations: {},

      startConversation: (id, question) =>
        set((state) => ({
          conversations: keepMostRecent({
            ...state.conversations,
            [id]: { id, title: titleFrom(question), updatedAt: Date.now(), entries: [], pendingInteraction: null },
          }),
        })),

      appendEntry: (id, entry, pendingInteraction) =>
        set((state) => {
          const conversation = state.conversations[id];
          if (!conversation) return state;
          return {
            conversations: keepMostRecent({
              ...state.conversations,
              [id]: {
                ...conversation,
                updatedAt: Date.now(),
                entries: [...conversation.entries, entry],
                pendingInteraction,
              },
            }),
          };
        }),

      deleteConversation: (id) =>
        set((state) => {
          const conversations = { ...state.conversations };
          delete conversations[id];
          return { conversations };
        }),
    }),
    {
      name: "intelligenceos.chat-history",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);
