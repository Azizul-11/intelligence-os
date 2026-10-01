import { useState, type ReactNode } from "react";

import {
  Header,
  MainContent,
  Sidebar,
} from ".";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({
  children,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen flex-col">
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((open) => !open)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} />

        <MainContent>
          {children}
        </MainContent>
      </div>
    </div>
  );
}