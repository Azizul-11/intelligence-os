export interface ChatResponse {
  success: boolean;

  answer: string;

  metadata?: {
    executionTimeMs?: number;
    rowCount?: number;
    /** Phase 3.5: a summary the grounding check rejected - why, and the text that was not shown. */
    summaryRejected?: { reason: string; text: string };
  };

  error?: string;

  /** Phase 8.10 Layer 2: this response needs follow-up; the client sends the next request with this ID in ChatRequest.pendingInteractionId. */
  pendingInteractionId?: string;

  /** Phase 8.10 Layer 2: "clarification" (disambiguate an entity) or "guidance" (pick an alternative capability). */
  interactionKind?: "clarification" | "guidance";

  /** Tier0 Task 2 (F8) Phase 2: this request's PhaseGateTracker id, correlating with the `phase_execution_trace` row(s).
   * Always present (a UUID is generated even if persistence fails), so presence does not imply it was persisted. */
  requestId?: string;

  /** Phase 8.1/8.13: which gate this response stopped at, shown by the frontend next to the phase pipeline (Tier0 Task 2 Phase 2). */
  answerability?: {
    status: string;
    reason?: string;
  };

  /** Tier0 Task 2 (F8) Phase 2: ordered gate trace, same data as `phase_execution_trace`, returned directly so the pipeline view needs no extra round-trip. Always present. */
  trace?: {
    phase: string;
    timestamp: number;
    status: string;
    sqlCalls: number;
    answerability?: string;
    /** Opaque diagnostics recorded verbatim by Universal Core; on "llm-normalization" it is which LLM tier answered (provider/model/attempts/latencyMs/tiers/fallbackUsed). */
    detail?: Record<string, string | number | boolean>;
  }[];

  /** Tier1 Task 6: 2-3 verified-answerable follow-up questions, verbatim from RuntimeResult.suggestions (see runtime-result.ts); on every response. */
  suggestions?: string[];

  /** Every LLM gateway call for this request, in completion order. `provider: "none"` means every tier failed or the deadline ran out;
   * an absent role was not called. */
  llmCalls?: {
    role: "normalizer" | "summary" | "suggestions" | "conversational" | "intent";
    provider: string;
    model: string;
    keyId: string;
    attempts: number;
    latencyMs: number;
    tiers: string;
    fallbackUsed: boolean;
  }[];

  /** LLM Layer 3: optional 1-2 sentence summary of `answer`'s rows, attached only after chat.ts's numeric cross-check passes.
   * Never replaces `answer`; a rejected/failed/timed-out summary leaves this absent. */
  summary?: string;
}