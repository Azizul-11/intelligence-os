import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {theme === "light" ? (
        <Moon className="size-[18px]" aria-hidden="true" />
      ) : (
        <Sun className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
