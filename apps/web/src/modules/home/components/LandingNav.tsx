import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { ThemeToggle } from "@/shared/components/ui/theme-toggle";
import { GithubMark } from "@/shared/components/icons/GithubMark";

const NAV_LINKS = [
  { label: "How it works", href: "#ledger" },
  { label: "Domain SDKs", href: "#domain-sdks" },
  { label: "Workspace", href: "/chat" },
];

const REPO_URL = "https://github.com/Azizul-11/intelligence-os";

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-md border border-border bg-surface font-mono text-sm text-primary"
          >
            &gt;
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">IntelligenceOS</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) =>
            link.href.startsWith("#") ? (
              <a key={link.href} href={link.href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                {link.label}
              </a>
            ) : (
              <Link key={link.href} to={link.href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                {link.label}
              </Link>
            ),
          )}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="IntelligenceOS on GitHub"
            className="inline-flex size-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubMark className="size-[18px]" />
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <div className="hidden md:block">
            <Button
              asChild
              size="sm"
              className="h-11 ember-cta hover:brightness-95"
            >
              <Link to="/chat">Open the query console</Link>
            </Button>
          </div>

          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="mobile-nav" aria-label="Primary" className="border-t border-border px-4 py-3 md:hidden">
          <ul className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                {link.href.startsWith("#") ? (
                  <a href={link.href} className="flex min-h-11 items-center py-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                    {link.label}
                  </a>
                ) : (
                  <Link to={link.href} className="flex min-h-11 items-center py-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex min-h-6 items-center gap-2 py-1 text-sm text-muted-foreground hover:text-foreground">
                <GithubMark className="size-4" />
                GitHub
              </a>
            </li>
            <li className="pt-1">
              <Button
                asChild
                size="sm"
                className="w-full ember-cta hover:brightness-95"
              >
                <Link to="/chat">Open the query console</Link>
              </Button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
