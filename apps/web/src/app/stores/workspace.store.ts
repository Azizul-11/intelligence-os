import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface WorkspaceState {
  workspaceId: string | null;
}

interface WorkspaceActions {
  setWorkspace: (id: string) => void;
  clearWorkspace: () => void;
}

type WorkspaceStore = WorkspaceState & WorkspaceActions;

export const useWorkspaceStore = create<WorkspaceStore>()(
  devtools(
    (set) => ({
      workspaceId: null,

      setWorkspace: (id) =>
        set(
          {
            workspaceId: id,
          },
          false,
          "workspace/set",
        ),

      clearWorkspace: () =>
        set(
          {
            workspaceId: null,
          },
          false,
          "workspace/clear",
        ),
    }),
    {
      name: "workspace-store",
    },
  ),
);