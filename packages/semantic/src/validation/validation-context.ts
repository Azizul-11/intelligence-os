import type {
  EntityDefinition,
  MetricDefinition,
  AliasDefinition,
  CategoryDefinition,
  DimensionDefinition,
  BenchmarkDefinition,
  RelationshipDefinition,
} from "@intelligence/contracts/semantic";

export interface SemanticValidationContext {
  entities: readonly EntityDefinition[];

  metrics: readonly MetricDefinition[];

  categories: readonly CategoryDefinition[];

  dimensions: readonly DimensionDefinition[];

  aliases: readonly AliasDefinition[];

  benchmarks: readonly BenchmarkDefinition[];

  relationships: readonly RelationshipDefinition[];
}