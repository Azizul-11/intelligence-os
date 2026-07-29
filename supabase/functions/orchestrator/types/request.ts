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
}