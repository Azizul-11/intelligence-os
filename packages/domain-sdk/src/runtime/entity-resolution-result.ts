import type { EntityResolutionStatus } from "./entity-resolution-status";

/**
 * Result of entity value resolution.
 *
 * This is a universal contract used by domains to report
 * whether a phrase could be resolved to a concrete entity value.
 */
export interface EntityResolutionResult {
  /**
   * Whether the phrase was successfully resolved.
   */
  found: boolean;

  /**
   * Canonical entity type identifier.
   *
   * Examples: "state", "hospital", "county"
   */
  entityId: string | null;

  /**
   * Resolved entity value.
   *
   * Examples: "CA", "123456", { id: "...", name: "..." }
   */
  value: unknown;

  /**
   * Original phrase from the query.
   */
  phrase: string | null;

  /**
   * Phase 7.5.1A: optional resolution outcome, in addition to `found`.
   *
   * Optional so every existing EntityProvider implementation (which
   * returns only the four fields above) remains valid without any
   * change - this field only carries additional information for
   * providers that choose to report it.
   *
   * When omitted, callers should continue to rely on `found`/`value`
   * exactly as before (a resolved, unique value when `found` is true;
   * nothing resolved when `found` is false).
   */
  status?: EntityResolutionStatus;

  /**
   * Phase 7.5.1A: candidate entity values when resolution is ambiguous
   * (status === "ambiguous") - more than one value could plausibly
   * match the mention, and none should be silently chosen.
   *
   * Domain-agnostic: Universal Core only ever checks how many
   * candidates exist, never what they mean.
   */
  candidates?: unknown[];
}
