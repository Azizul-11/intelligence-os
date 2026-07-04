import type { ID } from "@intelligence/contracts";

import type { ConfidenceScore } from "./confidence-score";

/**
 * Represents a possible match
 * between two entity candidates.
 */
export interface EntityMatch {
  /**
   * Source candidate.
   */
  source: ID;

  /**
   * Target candidate.
   */
  target: ID;

  /**
   * Confidence score.
   */
  confidence: ConfidenceScore;
}