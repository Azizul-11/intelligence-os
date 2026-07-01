import type { ReactNode } from "react";

import {
  Footer,
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
  return (
    <div className="flex h-screen flex-col">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <MainContent>
          {children}
        </MainContent>
      </div>

      <Footer />
    </div>
  );
}