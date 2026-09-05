/**
 * Phase 8.6C: a purely evidentiary, policy-neutral measurement of how
 * much of a request's own eligible population actually has the
 * requested metric's value present. Computed entirely within
 * `createRuntimeEngine()` from a Domain-declared companion query (see
 * `SqlTemplateDefinition.coverageTemplateId`) - never constructed,
 * consumed, or interpreted by any other package, which is why this
 * type is defined locally here rather than in a shared contracts
 * package (see the Phase 8.6C implementation report, "CoverageFact
 * Package Decision").
 *
 * Deliberately excludes a derived `missingCount`/`coverageRatio` - both
 * are trivially computable by any consumer from the two real counts
 * below, and omitting them guarantees no consumer ever reads a second,
 * potentially stale or inconsistent figure instead of computing its
 * own from these two real numbers.
 */
export interface CoverageFact {
  /**
   * Canonical metric identifier this fact concerns.
   */
  metric: string;

  /**
   * Count of entities satisfying the request's own non-metric scope
   * (e.g. a state filter) - never the metric's own presence condition,
   * and never influenced by any LIMIT/ORDER BY the ranking query
   * itself applied.
   */
  eligibleCount: number;

  /**
   * Of that same eligible population, the count that also has this
   * metric's value present. Always <= eligibleCount for a correctly
   * authored companion template.
   */
  coveredCount: number;
}
