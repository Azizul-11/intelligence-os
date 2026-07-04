import type { Source } from "./source";

/**
 * Represents a citation supporting a narrative.
 */
export interface Citation {
  /**
   * Source of the citation.
   */
  source: Source;

  /**
   * Optional page, section or location.
   */
  location?: string;
}