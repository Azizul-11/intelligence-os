import type { SemanticCandidate } from "@intelligence/semantic";

export interface SemanticCollections {
  metrics: SemanticCandidate[];

  entities: SemanticCandidate[];

  dimensions: SemanticCandidate[];

  categories: SemanticCandidate[];

  benchmarks: SemanticCandidate[];

  relationships: SemanticCandidate[];
}