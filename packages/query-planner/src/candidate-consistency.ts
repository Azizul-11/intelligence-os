/** Detects a candidate set that can't cohere: a relationship word ("above"/"below") with no benchmark to compare against. Reports only, never corrects. */
import type { SemanticCandidate } from "@intelligence/semantic";
import type { AliasDefinition } from "@intelligence/domain-sdk";

/** Phase 8.4: a relationship candidate with no benchmark candidate means the comparison word would be silently dropped. */
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

/** Tier0 Task 4 (F1): risk that a benchmark resolved to a generic alias only because an interrupting word broke a more specific phrase (e.g. "national mortality average"). */
export interface SubsumedBenchmarkRisk {
  parentPhrase: string;
  fallbackPhrase: string;
}

/**
 * Detects the risk above. Scoped to queries with a `relationship` candidate, mirroring hasRelationshipWithoutBenchmark().
 * Only flags when the more specific alias's candidate is ENTIRELY ABSENT - if both resolve, buildBenchmark()'s "longer span wins" already handles it.
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
