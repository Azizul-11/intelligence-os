import { activeDomain } from "@/domains";

import { Link } from "react-router-dom";

import { GithubMark } from "@/shared/components/icons/GithubMark";

const REPO_URL = "https://github.com/Azizul-11/intelligence-os";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Open the chat", to: "/chat", external: false },
      { label: "Settings", to: "/settings", external: false },
    ],
  },
  {
    heading: "How it works",
    links: [
      { label: "The trace", to: "#ledger", external: false },
      { label: "Domain SDKs", to: "#domain-sdks", external: false },
    ],
  },
  {
    heading: "Repository",
    links: [{ label: "Source on GitHub", to: REPO_URL, external: true }],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <span className="text-sm font-semibold tracking-tight text-foreground">IntelligenceOS</span>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              A domain-agnostic analytical intelligence platform. Deterministic execution, and no figure is ever
              produced by a model.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-6 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <GithubMark className="size-4" />
              GitHub
            </a>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="text-xs tracking-widest text-muted-foreground uppercase">
                {column.heading}
              </h3>
              <ul className="mt-3 flex flex-col gap-2.5">
                {column.links.map((link) =>
                  link.external ? (
                    <li key={link.label}>
                      <a
                        href={link.to}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-6 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : link.to.startsWith("#") ? (
                    <li key={link.label}>
                      <a
                        href={link.to}
                        className="inline-flex min-h-6 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="inline-flex min-h-6 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          <span>Copyright {new Date().getFullYear()} IntelligenceOS. Live domain: {activeDomain.label}.</span>
        </div>
      </div>
    </footer>
  );
}
