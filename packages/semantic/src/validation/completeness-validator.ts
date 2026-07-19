import type { SemanticValidationContext } from "./validation-context";
import type { SemanticValidationResult } from "./validation-result";
import type { SemanticValidator } from "./validator";

export class CompletenessValidator implements SemanticValidator {
  validate(
    context: SemanticValidationContext,
  ): SemanticValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    this.validateAliases(context, errors);
    this.validateRequiredFields(context, errors);

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  private validateAliases(
    context: SemanticValidationContext,
    errors: string[],
  ): void {
    for (const alias of context.aliases) {
      if (alias.aliases.length === 0) {
        errors.push(
          `Alias definition '${alias.id}' must contain at least one alias.`,
        );
      }

      if (this.isBlank(alias.canonical)) {
        errors.push(
          `Alias definition '${alias.id}' is missing a canonical value.`,
        );
      }
    }
  }

  private isBlank(value?: string): boolean {
    return value === undefined || value.trim().length === 0;
  }


  private validateRequiredFields(
  context: SemanticValidationContext,
  errors: string[],
): void {
  for (const entity of context.entities) {
    if (this.isBlank(entity.id)) {
      errors.push("Entity is missing an id.");
    }
  }

  for (const concept of context.concepts) {
    if (this.isBlank(concept.id)) {
      errors.push("Concept is missing an id.");
    }
  }

  for (const metric of context.metrics) {
    if (this.isBlank(metric.id)) {
      errors.push("Metric is missing an id.");
    }
  }

  for (const category of context.categories) {
    if (this.isBlank(category.id)) {
      errors.push("Category is missing an id.");
    }
  }

  for (const dimension of context.dimensions) {
    if (this.isBlank(dimension.id)) {
      errors.push("Dimension is missing an id.");
    }
  }

  for (const benchmark of context.benchmarks) {
    if (this.isBlank(benchmark.id)) {
      errors.push("Benchmark is missing an id.");
    }
  }

  for (const capability of context.capabilities) {
    if (this.isBlank(capability.id)) {
      errors.push("Capability is missing an id.");
    }
  }

  for (const recommendation of context.recommendations) {
    if (this.isBlank(recommendation.id)) {
      errors.push("Recommendation is missing an id.");
    }
  }

  for (const sqlTemplate of context.sqlTemplates) {
    if (this.isBlank(sqlTemplate.id)) {
      errors.push("SQL Template is missing an id.");
    }
  }
}
}

