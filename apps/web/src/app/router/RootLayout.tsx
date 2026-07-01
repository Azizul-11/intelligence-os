import { Outlet } from "react-router-dom";

import { AppShell } from "../layouts";

export default function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}