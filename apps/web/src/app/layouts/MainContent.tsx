import type { ReactNode } from "react";

type MainContentProps = {
  children: ReactNode;
};

export function MainContent({
  children,
}: MainContentProps) {
  return (
    <main className="flex-1 overflow-auto p-6">
      {children}
    </main>
  );
}