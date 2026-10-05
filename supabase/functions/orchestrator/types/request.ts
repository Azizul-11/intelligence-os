export interface ChatRequest {
  /** User's natural language question. */
  question: string;

  /** Domain to execute against (e.g. "healthcare"). */
  domain: string;

  /** Optional conversation/session identifier, for later multi-turn memory. */
  sessionId?: string;

  /** Optional user identifier, for persistence and permissions. */
  userId?: string;

  /** Phase 8.10 Layer 2: id of a pending clarification/guidance interaction; present means this request is its Turn 2 continuation. */
  pendingInteractionId?: string;

  /** Phase 8.10 Layer 2: user's reply to the pending prompt ("Tucson", "use overall rating"); required with pendingInteractionId. */
  continuationResponse?: string;
}