import { Link } from "react-router-dom";
import { PanelLeft, PanelLeftClose } from "lucide-react";

import { ThemeToggle } from "@/shared/components/ui/theme-toggle";

type HeaderProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function Header({ sidebarOpen, onToggleSidebar }: HeaderProps) {
  return (
    <header className="flex h-16 items-center gap-3 px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {sidebarOpen ? (
          <PanelLeftClose className="size-[18px]" aria-hidden="true" />
        ) : (
          <PanelLeft className="size-[18px]" aria-hidden="true" />
        )}
      </button>

      <Link
        to="/"
        className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-md border border-border bg-surface font-mono text-sm text-primary"
        >
          &gt;
        </span>
        <span className="text-lg font-semibold tracking-tight">IntelligenceOS</span>
      </Link>

      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
