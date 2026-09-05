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
}