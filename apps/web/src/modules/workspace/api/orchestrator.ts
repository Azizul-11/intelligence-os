/** Minimal client for the orchestrator edge function; mirrors the wire contract in supabase/functions/orchestrator/types, adds no semantics and renders the response as-is. */

export interface ChatRequest {
  question: string;
  domain: string;
  sessionId?: string;
  userId?: string;
  // Phase 8.10 Layer 2: Continuation support
  pendingInteractionId?: string;
  continuationResponse?: string;
}

export interface PhaseGateTraceEntry {
  phase: string;
  timestamp: number;
  status: string;
  sqlCalls: number;
  answerability?: string;
  /** Opaque diagnostics from the backend; on "llm-normalization" it is which LLM tier answered. */
  detail?: Record<string, string | number | boolean>;
}

/** One LLM gateway call the backend made for a response. `provider: "none"` = every tier failed or the deadline ran out. */
export interface LlmCall {
  role: "normalizer" | "summary" | "suggestions" | "conversational" | "intent";
  provider: string;
  model: string;
  keyId: string;
  attempts: number;
  latencyMs: number;
  tiers: string;
  fallbackUsed: boolean;
}

export interface ChatResponse {
  success: boolean;
  answer: string;
  metadata?: {
    executionTimeMs?: number;
    rowCount?: number;
    // Phase 3.5: a summary the grounding check rejected - why, and the text that was not shown
    summaryRejected?: { reason: string; text: string };
  };
  error?: string;
  // Phase 8.10 Layer 2: Continuation support
  pendingInteractionId?: string;
  interactionKind?: "clarification" | "guidance";
  // Tier0 Task 2 (F8) Phase 2: Query Tracer Observability
  requestId?: string;
  answerability?: { status: string; reason?: string };
  trace?: PhaseGateTraceEntry[];
  // Tier1 Task 6: 2-3 already-verified-answerable follow-up/recovery chips
  suggestions?: string[];
  // LLM Integration Layer 3: optional, numerically-verified 1-2 sentence summary of answer's rows
  summary?: string;
  // What the answer is about, from the backend's plan. Opaque to the workspace; only the active domain's components read it.
  presentation?: { focus?: Record<string, string | undefined> };
  // Every LLM call made for this response (absent role = not called)
  llmCalls?: LlmCall[];
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
  pendingInteractionId?: string,
  continuationResponse?: string,
): Promise<ChatResponse> {
  if (!ORCHESTRATOR_URL) {
    throw new OrchestratorConfigError(
      "VITE_ORCHESTRATOR_URL is not configured. Copy apps/web/.env.example to .env.local and set it.",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Edge functions expect an apikey/Authorization header even with --no-verify-jwt; only the public anon key is used, never a service-role key.
  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  const request: ChatRequest = { 
    question, 
    domain,
    pendingInteractionId,
    continuationResponse,
  };

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
