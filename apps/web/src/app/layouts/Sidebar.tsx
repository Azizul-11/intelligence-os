import { NavLink } from "react-router-dom";
import { MessageSquare } from "lucide-react";

import { cn } from "@/shared/lib/utils";

type SidebarProps = {
  open: boolean;
};

export function Sidebar({ open }: SidebarProps) {
  return (
    <aside className={cn("overflow-hidden transition-all duration-200", open ? "w-64 border-r p-4" : "w-0 p-0")}>
      <nav className="flex flex-col gap-2">
        <NavLink
          to="/chat"
          title="Chat"
          aria-label="Chat"
          className={({ isActive }) =>
            cn(
              "inline-flex size-11 items-center justify-center rounded-md transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )
          }
        >
          <MessageSquare className="size-5" aria-hidden="true" />
        </NavLink>
      </nav>
    </aside>
  );
}
