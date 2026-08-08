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
}
