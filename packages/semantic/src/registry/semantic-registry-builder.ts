import type {
  BenchmarkDefinition,
  CategoryDefinition,
  ConceptDefinition,
  DimensionDefinition,
  EntityDefinition,
  MetricDefinition,
  RelationshipDefinition,
} from "@intelligence/domain-sdk";

import type { SemanticRegistryData } from "./semantic-registry-data";
import { SemanticRegistry } from "./semantic-registry";


export class SemanticRegistryBuilder {
  private readonly aliases =
    new Map<string, string>();
private readonly metrics =
  new Map<string, MetricDefinition>();

private readonly entities =
  new Map<string, EntityDefinition>();

private readonly concepts =
  new Map<string, ConceptDefinition>();

private readonly categories =
  new Map<string, CategoryDefinition>();

private readonly relationships =
  new Map<string, RelationshipDefinition>();

private readonly dimensions =
  new Map<string, DimensionDefinition>();

private readonly benchmarks =
  new Map<string, BenchmarkDefinition>();

  addAlias(alias: string, canonicalKey: string): this {
    this.aliases.set(alias, canonicalKey);
    return this;
  }

 addMetric(
  metric: MetricDefinition,
): this {
  this.metrics.set(metric.id, metric);
  return this;
}

  addEntity(
  entity: EntityDefinition,
): this {
  this.entities.set(entity.id, entity);
  return this;
}

  addCategory(
  category: CategoryDefinition,
): this {
  this.categories.set(category.id, category);
  return this;
}

 addConcept(
  concept: ConceptDefinition,
): this {
  this.concepts.set(concept.id, concept);
  return this;
}

  addRelationship(
  relationship: RelationshipDefinition,
): this {
  this.relationships.set(
    relationship.id,
    relationship,
  );

  return this;
}

addDimension(
  dimension: DimensionDefinition,
): this {
  this.dimensions.set(
    dimension.id,
    dimension,
  );

  return this;
}

addBenchmark(
  benchmark: BenchmarkDefinition,
): this {
  this.benchmarks.set(
    benchmark.id,
    benchmark,
  );

  return this;
}

  build(): SemanticRegistry {
    const data: SemanticRegistryData = {
    aliases: this.aliases,
    metrics: this.metrics,
    entities: this.entities,
    concepts: this.concepts,
    categories: this.categories,
    dimensions: this.dimensions,
    relationships: this.relationships,
    benchmarks: this.benchmarks,
};

    return new SemanticRegistry(data);
  }
}