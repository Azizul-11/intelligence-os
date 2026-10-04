import { useState, type ReactNode } from "react";

import { Header, MainContent, Sidebar } from ".";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  // Mobile-first: starts as an icon rail below 768px so the chat column isn't squeezed; the rail expands on demand.
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);

  return (
    <div className="flex h-dvh">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}
