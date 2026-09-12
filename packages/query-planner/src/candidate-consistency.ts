import type { SemanticCandidate } from "@intelligence/semantic";
import type { AliasDefinition } from "@intelligence/domain-sdk";

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

/**
 * Tier0 Task 4 (F1): a genuine, detected risk that a query's benchmark
 * comparison resolved to a generic alias's meaning (e.g. `median`) only
 * because a more specific alias's own multi-word phrase (e.g. "national
 * average") was broken by an interrupting word (e.g. "national
 * mortality average") - never because the user simply meant the
 * generic meaning. `parentPhrase`/`fallbackPhrase` are the Domain's own
 * registered alias text, for use in a clarification message; Universal
 * Core never inspects or hardcodes their content.
 */
export interface SubsumedBenchmarkRisk {
  parentPhrase: string;
  fallbackPhrase: string;
}

/**
 * Detects the risk described above. Domain-agnostic: reads only the
 * generic `relationship`/`benchmark` semantic-type categories, each
 * candidate's own `canonicalKey`, the Domain's own declared
 * `AliasDefinition.genericFallbackOf`/`aliases`, and the query's own
 * normalized word set - never a hardcoded alias string or domain
 * vocabulary.
 *
 * Scoped to queries that also carry a `relationship` candidate (e.g.
 * "above"/"below"), mirroring `hasRelationshipWithoutBenchmark`'s own
 * scoping - this is the only proven context this defect reproduces in;
 * an "average" mention used for a different intent entirely (e.g. an
 * aggregation request with no comparison) is left untouched.
 *
 * Only flags risk when the more specific alias's own candidate is
 * ENTIRELY ABSENT - when both resolve (the alias wasn't actually
 * interrupted), `ExecutionPlanMapper.buildBenchmark()`'s existing
 * "longer span wins" rule already picks the more specific one
 * correctly, and this function must not re-flag that already-safe case.
 */
export function detectSubsumedBenchmarkRisk(
  candidates: readonly SemanticCandidate[],
  normalizedQuery: string,
  aliasDefinitions: readonly AliasDefinition[],
): SubsumedBenchmarkRisk | null {
  const hasRelationship = candidates.some(
    (candidate) => candidate.semanticType === "relationship",
  );

  if (!hasRelationship) {
    return null;
  }

  const benchmarkCandidates = candidates.filter(
    (candidate) => candidate.semanticType === "benchmark",
  );

  const queryWords = new Set(normalizedQuery.split(" ").filter(Boolean));

  for (const candidate of benchmarkCandidates) {
    const fallbackAlias = aliasDefinitions.find(
      (alias) => alias.canonical === candidate.canonicalKey && alias.genericFallbackOf,
    );

    if (!fallbackAlias?.genericFallbackOf) {
      continue;
    }

    const parentAlreadyResolved = benchmarkCandidates.some(
      (other) => other.canonicalKey === fallbackAlias.genericFallbackOf,
    );

    if (parentAlreadyResolved) {
      continue;
    }

    const parentAlias = aliasDefinitions.find(
      (alias) => alias.canonical === fallbackAlias.genericFallbackOf,
    );

    if (!parentAlias) {
      continue;
    }

    const interruptedPhrase = parentAlias.aliases.find((phrase) => {
      const words = phrase.toLowerCase().split(" ").filter(Boolean);
      return words.length > 1 && words.every((word) => queryWords.has(word));
    });

    if (interruptedPhrase) {
      return {
        parentPhrase: interruptedPhrase,
        fallbackPhrase: fallbackAlias.aliases[0] ?? candidate.phrase,
      };
    }
  }

  return null;
}
