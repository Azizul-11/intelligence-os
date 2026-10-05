/** Deterministic confidence score in the range 0.0 to 1.0. */
export interface ConfidenceScore {
  /** Match confidence. */
  value: number;

  /** Explanation of the score. */
  reason?: string;
}