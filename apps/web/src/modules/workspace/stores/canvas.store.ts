import { create } from "zustand";

interface CanvasState {
  entryId: string | null;
  width: number | null;
  // The answer that just landed, until its card opens the canvas for it.
  arrivedId: string | null;
  // The user closed the canvas, so answers stop opening it until they reopen it.
  autoOpenOff: boolean;
  // The canvas was opened by an answer, not by the user.
  autoOpened: boolean;
  // User opens it: answers may open it again.
  open: (entryId: string) => void;
  // User closes it: answers stop opening it.
  close: () => void;
  // Closed by the app (a question was sent from it): answers may still open it.
  hide: () => void;
  arrive: (entryId: string) => void;
  autoOpen: (entryId: string) => void;
  resetAutoOpen: () => void;
  setWidth: (width: number) => void;
}

export const useCanvas = create<CanvasState>()((set, get) => ({
  entryId: null,
  width: null,
  arrivedId: null,
  autoOpenOff: false,
  autoOpened: false,
  open: (entryId) => set({ entryId, autoOpenOff: false, autoOpened: false }),
  close: () => set({ entryId: null, autoOpenOff: true }),
  hide: () => set({ entryId: null }),
  arrive: (arrivedId) => set({ arrivedId }),
  autoOpen: (entryId) => {
    const { arrivedId, autoOpenOff } = get();
    if (arrivedId !== entryId) return;
    set(autoOpenOff ? { arrivedId: null } : { arrivedId: null, entryId, autoOpened: true });
  },
  resetAutoOpen: () => set({ arrivedId: null, autoOpenOff: false, autoOpened: false }),
  setWidth: (width) => set({ width }),
}));
