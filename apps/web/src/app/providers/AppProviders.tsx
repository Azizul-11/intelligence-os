import type { ReactNode } from "react";

import { QueryProvider } from "./QueryProvider";

type Props = {
  children: ReactNode;
};

export function AppProviders({ children }: Props) {
  return (
    <QueryProvider>
      {children}
    </QueryProvider>
  );
}