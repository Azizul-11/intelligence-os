import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

interface AppState {
  sidebarOpen: boolean;
  theme: ThemeMode;
}

interface AppActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
}

type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      sidebarOpen: true,

      theme: "system",

      toggleSidebar: () =>
        set(
          (state) => ({
            sidebarOpen: !state.sidebarOpen,
          }),
          false,
          "app/toggleSidebar",
        ),

      setSidebarOpen: (open) =>
        set(
          {
            sidebarOpen: open,
          },
          false,
          "app/setSidebarOpen",
        ),

      setTheme: (theme) =>
        set(
          {
            theme,
          },
          false,
          "app/setTheme",
        ),
    }),
    {
      name: "app-store",
    },
  ),
);