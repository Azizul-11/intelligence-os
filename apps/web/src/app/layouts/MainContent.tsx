import type { ReactNode } from "react";

type MainContentProps = {
  children: ReactNode;
};

export function MainContent({
  children,
}: MainContentProps) {
  return (
    <main className="flex-1 overflow-hidden">
      {children}
    </main>
  );
}