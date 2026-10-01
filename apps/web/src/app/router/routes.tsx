import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";

import RootLayout from "./RootLayout";

// Route-level code splitting: a visitor landing on "/" never downloads the
// workspace's chat/query-console bundle, and vice versa.
const HomePage = lazy(() => import("@/modules/home/pages/HomePage"));
const WorkspacePage = lazy(() => import("@/modules/workspace/pages/WorkspacePage"));
const SettingsPage = lazy(() => import("@/modules/settings/pages/SettingsPage"));
const NotFoundPage = lazy(() => import("@/modules/not-found/pages/NotFoundPage"));

function withSuspense(element: ReactNode) {
  return <Suspense fallback={null}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    // The landing page owns its own nav/footer and never sits inside the
    // app's internal AppShell (sidebar + workspace header).
    path: "/",
    element: withSuspense(<HomePage />),
  },
  {
    element: <RootLayout />,
    children: [
      {
        path: "chat",
        element: withSuspense(<WorkspacePage />),
      },
      {
        path: "settings",
        element: withSuspense(<SettingsPage />),
      },
      {
        path: "*",
        element: withSuspense(<NotFoundPage />),
      },
    ],
  },
]);
