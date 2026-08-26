/**
 * Minimal client for the existing IntelligenceOS orchestrator edge function.
 *
 * This is a client-side mirror of the already-fixed wire contract declared in
 * supabase/functions/orchestrator/types/{request,response}.ts - it does not
 * introduce a second execution path, a new backend, or any new semantics.
 * The frontend never interprets, corrects, or summarizes what the backend
 * returns; it only forwards the question and renders the response as-is.
 */

export interface ChatRequest {
  question: string;
  domain: string;
  sessionId?: string;
  userId?: string;
}

export interface ChatResponse {
  success: boolean;
  answer: string;
  metadata?: {
    executionTimeMs?: number;
    rowCount?: number;
  };
  error?: string;
}

const ORCHESTRATOR_URL = import.meta.env.VITE_ORCHESTRATOR_URL as
  | string
  | undefined;

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export class OrchestratorConfigError extends Error {}

export async function askOrchestrator(
  question: string,
  domain: string,
): Promise<ChatResponse> {
  if (!ORCHESTRATOR_URL) {
    throw new OrchestratorConfigError(
      "VITE_ORCHESTRATOR_URL is not configured. Copy apps/web/.env.example to .env.local and set it.",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Supabase edge functions expect an apikey/Authorization header even when
  // the function itself performs no auth check of its own (--no-verify-jwt).
  // Only the public anon key is ever used here - never a service-role key.
  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  const request: ChatRequest = { question, domain };

  const response = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  const body = (await response.json()) as ChatResponse;

  // The orchestrator itself already distinguishes success/failure inside the
  // JSON body (its own contract) - an HTTP-level non-2xx with a parseable
  // body still carries real, honest backend evidence and must be surfaced,
  // not discarded.
  return body;
}
