/**
 * Deterministic confidence score.
 *
 * Value range:
 * 0.0 → 1.0
 */
export interface ConfidenceScore {
  /**
   * Match confidence.
   */
  value: number;

  /**
   * Explanation of the score.
   */
  reason?: string;
}