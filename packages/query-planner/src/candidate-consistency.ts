import type { SemanticCandidate } from "@intelligence/semantic";

/**
 * Phase 8.4: detects a semantic candidate set that cannot cohere into a
 * valid interpretation - specifically, a `relationship` candidate (e.g.
 * "above"/"below") present with no `benchmark` candidate to compare
 * against. `ExecutionPlanMapper.buildBenchmark()` already requires both
 * before building any benchmark (RCG-009); without this check, the
 * relationship word is silently dropped and the query executes as an
 * ordinary, unfiltered request - a materially different answer than what
 * was asked, returned as a success. This function only reports the
 * inconsistency; it never corrects, guesses a benchmark, or fabricates a
 * threshold.
 *
 * Domain-agnostic: reads only the generic `relationship`/`benchmark`
 * semantic-type categories every Domain SDK's candidates already carry -
 * never a domain-specific canonical id or vocabulary.
 */
export function hasRelationshipWithoutBenchmark(
  candidates: readonly SemanticCandidate[],
): boolean {
  const hasRelationship = candidates.some(
    (candidate) => candidate.semanticType === "relationship",
  );

  const hasBenchmark = candidates.some(
    (candidate) => candidate.semanticType === "benchmark",
  );

  return hasRelationship && !hasBenchmark;
}
