import type { SemanticCandidate } from "@intelligence/semantic";

import type { SemanticCollections } from "./semantic-collections";

export class SemanticCollector {
  collect(
    matches: SemanticCandidate[],
  ): SemanticCollections {
    return {
      metrics: matches.filter(
        (match) => match.semanticType === "metric",
      ),

      entities: matches.filter(
        (match) => match.semanticType === "entity",
      ),

      dimensions: matches.filter(
        (match) => match.semanticType === "dimension",
      ),

      categories: matches.filter(
        (match) => match.semanticType === "category",
      ),

      benchmarks: matches.filter(
        (match) => match.semanticType === "benchmark",
      ),

      relationships: matches.filter(
        (match) => match.semanticType === "relationship",
      ),
    };
  }
}