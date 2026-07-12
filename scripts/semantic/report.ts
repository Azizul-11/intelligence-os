import type {
  AliasDefinition,
  BenchmarkDefinition,
  CategoryDefinition,
  DimensionDefinition,
  EntityDefinition,
  MetricDefinition,
  RelationshipDefinition,
} from "@intelligence/contracts/semantic";

import type { SemanticValidationResult } from "./validate";

export interface SemanticReport {
  entities: number;

  metrics: number;

  categories: number;

  dimensions: number;

  aliases: number;

  benchmarks: number;

  relationships: number;

  warnings: number;

  errors: number;
}

export function createSemanticReport(
  input: {
    entities: readonly EntityDefinition[];

    metrics: readonly MetricDefinition[];

    categories: readonly CategoryDefinition[];

    dimensions: readonly DimensionDefinition[];

    aliases: readonly AliasDefinition[];

    benchmarks: readonly BenchmarkDefinition[];

    relationships: readonly RelationshipDefinition[];
  },

  validation: SemanticValidationResult,
): SemanticReport {
  return {
    entities: input.entities.length,

    metrics: input.metrics.length,

    categories: input.categories.length,

    dimensions: input.dimensions.length,

    aliases: input.aliases.length,

    benchmarks: input.benchmarks.length,

    relationships: input.relationships.length,

    warnings: validation.warnings.length,

    errors: validation.errors.length,
  };
}