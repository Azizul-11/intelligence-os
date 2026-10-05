import { useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

// A lazy chunk fetch fails on dropped connection or a new deploy (stale chunk hash); a fresh reload fixes the latter, so retry once per short window before showing the error.
const RELOAD_FLAG_KEY = "chunk-load-retried-at";
const RELOAD_WINDOW_MS = 10_000;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch dynamically imported module/i.test(message);
}

function hasRecentlyRetried(): boolean {
  const lastAttempt = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) ?? 0);
  return Date.now() - lastAttempt < RELOAD_WINDOW_MS;
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const isChunkFailure = !isRouteErrorResponse(error) && isChunkLoadError(error);
  const alreadyRetried = isChunkFailure && hasRecentlyRetried();

  useEffect(() => {
    if (isChunkFailure && !alreadyRetried) {
      sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
      window.location.reload();
    }
  }, [isChunkFailure, alreadyRetried]);

  // A reload is already in flight - render nothing rather than flash the fallback.
  if (isChunkFailure && !alreadyRetried) return null;

  const message = isChunkFailure
    ? "This usually means your connection dropped, or a new version just went live. Check your connection and try again."
    : isRouteErrorResponse(error)
      ? error.statusText || "An unexpected error occurred."
      : error instanceof Error
        ? error.message
        : "An unexpected error occurred.";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-md border border-border bg-surface font-mono text-base text-primary"
      >
        !
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {isChunkFailure ? "Couldn't load that page" : "Something went wrong"}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 inline-flex h-10 items-center justify-center rounded-lg ember-cta px-5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Try again
      </button>
    </div>
  );
}
