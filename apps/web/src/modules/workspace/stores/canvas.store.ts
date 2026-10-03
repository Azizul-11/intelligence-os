import { create } from "zustand";

interface CanvasState {
  entryId: string | null;
  width: number | null;
  open: (entryId: string) => void;
  close: () => void;
  setWidth: (width: number) => void;
}

export const useCanvas = create<CanvasState>()((set) => ({
  entryId: null,
  width: null,
  open: (entryId) => set({ entryId }),
  close: () => set({ entryId: null }),
  setWidth: (width) => set({ width }),
}));
