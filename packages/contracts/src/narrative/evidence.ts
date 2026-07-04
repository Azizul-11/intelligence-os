import type { Citation } from "./citation";

/**
 * Represents evidence supporting a narrative.
 */
export interface Evidence {
  /**
   * Supporting statement or observation.
   */
  statement: string;

  /**
   * Supporting citation.
   */
  citation?: Citation;
}