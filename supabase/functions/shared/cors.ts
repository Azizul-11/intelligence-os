const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

/** Comma-separated origins in the ALLOWED_ORIGINS secret; `https://*.example.com` matches one subdomain label (preview deploys). */
function allowedOrigins(): string[] {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  const list = configured ? configured.split(",") : DEFAULT_ALLOWED_ORIGINS;

  return list.map((entry) => entry.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins().some((entry) => {
    if (!entry.includes("*")) {
      return entry === origin;
    }

    const pattern = entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace("*", "[a-z0-9-]+");
    return new RegExp(`^${pattern}$`).test(origin);
  });
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Origin",
} as const;

/** Headers for every response: the security set always, and CORS only for an allowed, echoed origin (never `*`). */
export function responseHeaders(origin: string | null): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin)) {
    return { ...SECURITY_HEADERS };
  }

  return {
    ...SECURITY_HEADERS,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
  };
}
