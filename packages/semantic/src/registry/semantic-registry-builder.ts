import type { SemanticRegistryData } from "./semantic-registry-data";
import { SemanticRegistry } from "./semantic-registry";

export class SemanticRegistryBuilder {
  private readonly aliases = new Map<string, string>();

  private readonly metrics = new Set<string>();

  private readonly entities = new Set<string>();

  private readonly categories = new Set<string>();

  private readonly relationships = new Set<string>();

  addAlias(alias: string, canonicalKey: string): this {
    this.aliases.set(alias, canonicalKey);
    return this;
  }

  addMetric(metricKey: string): this {
    this.metrics.add(metricKey);
    return this;
  }

  addEntity(entityKey: string): this {
    this.entities.add(entityKey);
    return this;
  }

  addCategory(categoryKey: string): this {
    this.categories.add(categoryKey);
    return this;
  }

  addRelationship(relationshipKey: string): this {
    this.relationships.add(relationshipKey);
    return this;
  }

  build(): SemanticRegistry {
    const data: SemanticRegistryData = {
      aliases: this.aliases,
      metrics: this.metrics,
      entities: this.entities,
      categories: this.categories,
      relationships: this.relationships,
    };

    return new SemanticRegistry(data);
  }
}