export interface ChatRequest {
  /**
   * User's natural language question.
   */
  question: string;

  /**
   * Domain to execute against.
   * Examples:
   * "healthcare"
   * "education"
   */
  domain: string;

  /**
   * Optional conversation/session identifier.
   * Used later for multi-turn memory.
   */
  sessionId?: string;

  /**
   * Optional user identifier.
   * Useful for persistence and permissions.
   */
  userId?: string;

  /**
   * Phase 8.10 Layer 2: Optional identifier for a pending clarification or
   * guidance interaction. If present, this request is a continuation (Turn 2)
   * responding to a previous clarification/guidance prompt (Turn 1).
   */
  pendingInteractionId?: string;

  /**
   * Phase 8.10 Layer 2: User's response to the pending clarification/guidance.
   * Required if pendingInteractionId is present.
   * Examples: "Tucson" (clarification) or "use overall rating" (guidance)
   */
  continuationResponse?: string;
}