import { ThemeToggle } from "@/shared/components/ui/theme-toggle";

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-end px-6">
      <ThemeToggle />
    </header>
  );
}
