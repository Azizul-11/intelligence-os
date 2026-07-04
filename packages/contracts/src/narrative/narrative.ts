import type { Evidence } from "./evidence";

/**
 * Represents a human-readable explanation derived from deterministic data.
 */
export interface Narrative {
  /**
   * Narrative identifier.
   */
  id: string;

  /**
   * Narrative text.
   */
  text: string;

  /**
   * Supporting evidence.
   */
  evidence?: Evidence[];
}