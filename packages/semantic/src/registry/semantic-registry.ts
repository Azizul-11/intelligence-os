import type { SemanticRegistryData } from "./semantic-registry-data";
import type { SemanticType } from "@intelligence/domain-sdk";
export class SemanticRegistry {
  constructor(
    private readonly data: SemanticRegistryData,
  ) {}

  getAliases(): ReadonlyMap<string, string> {
    return this.data.aliases;
  }

  hasMetric(metricKey: string): boolean {
    return this.data.metrics.has(metricKey);
  }

  hasEntity(entityKey: string): boolean {
    return this.data.entities.has(entityKey);
  }

  hasConcept(conceptKey: string): boolean {
    return this.data.concepts.has(conceptKey);
  }

  hasCategory(categoryKey: string): boolean {
    return this.data.categories.has(categoryKey);
  }

  hasRelationship(relationshipKey: string): boolean {
    return this.data.relationships.has(relationshipKey);
  }

  hasDimension(dimensionKey: string): boolean {
    return this.data.dimensions.has(dimensionKey);
  }

  hasBenchmark(benchmarkKey: string): boolean {
    return this.data.benchmarks.has(benchmarkKey);
  }

  getSemanticType(canonicalKey: string): SemanticType | null {
    if (this.data.metrics.has(canonicalKey)) {
      return "metric";
    }

    if (this.data.entities.has(canonicalKey)) {
      return "entity";
    }

    if (this.data.concepts.has(canonicalKey)) {
      return "concept";
    }

    if (this.data.categories.has(canonicalKey)) {
      return "category";
    }

    if (this.data.relationships.has(canonicalKey)) {
      return "relationship";
    }

    if (this.data.dimensions.has(canonicalKey)) {
      return "dimension";
    }

    if (this.data.benchmarks.has(canonicalKey)) {
      return "benchmark";
    }

    return null;
  }
}