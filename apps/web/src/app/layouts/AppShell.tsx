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
  // Mobile-first: closed by default below the 768px breakpoint so the chat column isn't squeezed; the header toggle still opens it on demand.
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);

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