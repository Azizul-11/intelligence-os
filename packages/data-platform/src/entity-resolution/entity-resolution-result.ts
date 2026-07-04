import type { Timestamp } from "@intelligence/contracts";

import type { EntityMatch } from "./entity-match";

/**
 * Result of entity resolution.
 */
export interface EntityResolutionResult {
  /**
   * Resolution status.
   */
  success: boolean;

  /**
   * Matches discovered.
   */
  matches: EntityMatch[];

  /**
   * Total entities resolved.
   */
  resolved: number;

  /**
   * Processing timestamps.
   */
  timestamps?: Timestamp;
}