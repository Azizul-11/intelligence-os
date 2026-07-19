import type {
  EntityDefinition,
  ConceptDefinition,
  MetricDefinition,
  AliasDefinition,
  CategoryDefinition,
  DimensionDefinition,
  BenchmarkDefinition,
  RelationshipDefinition,
  SqlTemplateDefinition,
  CapabilityDefinition,
  RecommendationDefinition,
} from "@intelligence/domain-sdk";

export interface SemanticValidationContext {
  entities: readonly EntityDefinition[];

  concepts: readonly ConceptDefinition[];

  metrics: readonly MetricDefinition[];

  aliases: readonly AliasDefinition[];

  dimensions: readonly DimensionDefinition[];

  categories: readonly CategoryDefinition[];

  relationships: readonly RelationshipDefinition[];

  benchmarks: readonly BenchmarkDefinition[];

  sqlTemplates: readonly SqlTemplateDefinition[];

  capabilities: readonly CapabilityDefinition[];

  recommendations: readonly RecommendationDefinition[];
}