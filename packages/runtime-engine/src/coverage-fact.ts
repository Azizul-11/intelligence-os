/** Phase 8.6C: evidentiary, policy-neutral measure of how much of a request's eligible population has the metric's value, from a Domain companion query (`SqlTemplateDefinition.coverageTemplateId`).
 * Defined locally (no other package uses it); deliberately has no derived `missingCount`/`coverageRatio`, so no consumer reads a second, possibly inconsistent figure. */
export interface CoverageFact {
  /** Canonical metric identifier this fact concerns. */
  metric: string;

  /** Entities satisfying the request's non-metric scope (e.g. a state filter); never the metric's presence condition or any LIMIT/ORDER BY. */
  eligibleCount: number;

  /** Of the eligible population, those with the metric's value present; always <= eligibleCount for a correct companion template. */
  coveredCount: number;
}
