import { cn } from "@/shared/lib/utils";
import { NavLink } from "react-router-dom";

const navigation = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Workspace",
    href: "/workspace",
  },
  {
    label: "Settings",
    href: "/settings",
  },
];

export function Sidebar() {
  return (
    <aside className="w-64 border-r p-4">
      <nav className="flex flex-col gap-2">
        {navigation.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
           className={({ isActive }) =>
  cn(
    "rounded-md px-3 py-2 transition-colors",
    isActive
      ? "bg-primary text-primary-foreground"
      : "hover:bg-muted",
  )
}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}