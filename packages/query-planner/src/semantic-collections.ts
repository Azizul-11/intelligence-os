/** Resolved semantic candidates bucketed by type - the shape SemanticCollector.collect() returns. */
import type { SemanticCandidate } from "@intelligence/semantic";

export interface SemanticCollections {
  metrics: SemanticCandidate[];

  entities: SemanticCandidate[];

  dimensions: SemanticCandidate[];

  categories: SemanticCandidate[];

  concepts: SemanticCandidate[];

  benchmarks: SemanticCandidate[];

  relationships: SemanticCandidate[];
}