import type { SemanticRegistryData } from "./semantic-registry-data";

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

  hasCategory(categoryKey: string): boolean {
    return this.data.categories.has(categoryKey);
  }

  hasRelationship(relationshipKey: string): boolean {
    return this.data.relationships.has(relationshipKey);
  }
}