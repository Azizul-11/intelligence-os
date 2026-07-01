import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (token: string) => void;
  logout: () => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set) => ({
      accessToken: null,

      isAuthenticated: false,

      login: (token) =>
        set(
          {
            accessToken: token,
            isAuthenticated: true,
          },
          false,
          "auth/login",
        ),

      logout: () =>
        set(
          {
            accessToken: null,
            isAuthenticated: false,
          },
          false,
          "auth/logout",
        ),
    }),
    {
      name: "auth-store",
    },
  ),
);