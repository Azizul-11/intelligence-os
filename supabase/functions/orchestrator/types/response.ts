export interface ChatResponse {
  success: boolean;

  answer: string;

  metadata?: {
    executionTimeMs?: number;
    rowCount?: number;
  };

  error?: string;

  /**
   * Phase 8.10 Layer 2: If present, this response requires user follow-up
   * (clarification or guidance choice). The client should send the next
   * request with this ID in ChatRequest.pendingInteractionId.
   */
  pendingInteractionId?: string;

  /**
   * Phase 8.10 Layer 2: Type of pending interaction, if applicable.
   * - "clarification": User must disambiguate an ambiguous entity
   * - "guidance": User may select an alternative capability
   */
  interactionKind?: "clarification" | "guidance";

  /**
   * Tier0 Task 2 (F8) Phase 2: this request's PhaseGateTracker id -
   * correlates with the `phase_execution_trace` row(s) persisted for it,
   * so a client can fetch the full gate-by-gate trace for this specific
   * response. Always present (a fresh UUID is generated even when
   * tracing/persistence itself fails, so the field's presence never
   * implies persistence succeeded).
   */
  requestId?: string;

  /**
   * Phase 8.1/8.13: which gate this response stopped at, surfaced
   * directly to the client (not just used internally to decide the
   * pending_interactions flow) - the frontend link (Tier0 Task 2 Phase 2)
   * renders this alongside the phase pipeline.
   */
  answerability?: {
    status: string;
    reason?: string;
  };

  /**
   * Tier0 Task 2 (F8) Phase 2: the ordered gate trace for this exact
   * response (same data persisted to `phase_execution_trace`, returned
   * directly too so the frontend pipeline view needs no separate
   * round-trip). Always present.
   */
  trace?: { phase: string; timestamp: number; status: string; sqlCalls: number; answerability?: string }[];

  /**
   * Tier1 Task 6: 2-3 already-verified-answerable follow-up/recovery
   * question texts, forwarded verbatim from RuntimeResult.suggestions -
   * present on every response (success, clarification, guidance, or
   * plain failure). See packages/runtime-engine/src/runtime-result.ts
   * for the full contract doc comment.
   */
  suggestions?: string[];

  /**
   * LLM Integration Layer 3 (Executive Answer Synthesis): an optional
   * 1-2 sentence natural-language summary of `answer`'s own rows,
   * attached ONLY after chat.ts's deterministic numeric cross-check
   * confirms every number in the summary literally appears in the rows
   * it summarizes. Never replaces `answer` (the full row JSON is always
   * populated independently of whether this field is present) - a
   * rejected/failed/timed-out summary simply leaves this field absent,
   * degrading to exactly the pre-Layer-3 response shape.
   */
  summary?: string;
}