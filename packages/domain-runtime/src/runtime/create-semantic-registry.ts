import type { DomainPack } from "@intelligence/domain-sdk";
import {
  SemanticRegistryBuilder,
  type SemanticRegistry,
} from "@intelligence/semantic";

export function createSemanticRegistry(
  domain: DomainPack,
): SemanticRegistry {
  const builder = new SemanticRegistryBuilder();

  // Metrics
  for (const metric of domain.metrics) {
    builder.addMetric(metric.id);
  }

  // Entities
  for (const entity of domain.entities) {
    builder.addEntity(entity.id);
  }

  // Categories
  for (const category of domain.categories) {
    builder.addCategory(category.id);
  }

  // Dimensions
  for (const dimension of domain.dimensions) {
    builder.addDimension(dimension.id);
  }

  // Relationships
  for (const relationship of domain.relationships) {
    builder.addRelationship(relationship.id);
  }

  // Benchmarks
  for (const benchmark of domain.benchmarks) {
    builder.addBenchmark(benchmark.id);
  }

  // Aliases
  for (const aliasDefinition of domain.aliases) {
    for (const alias of aliasDefinition.aliases) {
      builder.addAlias(alias, aliasDefinition.canonical);
    }
  }

  return builder.build();
}