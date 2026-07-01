import { createBrowserRouter } from "react-router-dom";

import RootLayout from "./RootLayout";

import HomePage from "@/modules/home/pages/HomePage";
import WorkspacePage from "@/modules/workspace/pages/WorkspacePage";
import SettingsPage from "@/modules/settings/pages/SettingsPage";
import NotFoundPage from "@/modules/not-found/pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "workspace",
        element: <WorkspacePage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);