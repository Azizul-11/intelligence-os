import type { EntityResolutionStatus } from "./entity-resolution-status";

/** Universal contract for whether a phrase resolved to a concrete entity value. */
export interface EntityResolutionResult {
  found: boolean;

  /** Canonical entity type id, e.g. "state", "hospital", "county". */
  entityId: string | null;

  /** Resolved value, e.g. "CA", "123456", or a domain-shaped object. */
  value: unknown;

  phrase: string | null;

  /** Phase 7.5.1A: optional outcome beyond `found` - omitted means fall back to `found`/`value` as before. */
  status?: EntityResolutionStatus;

  /** Phase 7.5.1A: candidates when ambiguous. Phase 8.3: may be shaped as AmbiguousCandidate for a targeted clarification. */
  candidates?: unknown[];
}
