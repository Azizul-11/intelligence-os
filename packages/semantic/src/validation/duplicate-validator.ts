import type { SemanticValidationContext } from "./validation-context";
import type { SemanticValidationResult } from "./validation-result";
import type { SemanticValidator } from "./validator";

export class DuplicateValidator implements SemanticValidator {
  validate(context: SemanticValidationContext): SemanticValidationResult {
    const errors: string[] = [];

    this.checkDuplicates(
      context.entities.map((e) => e.id),
      "Entity",
      errors,
    );

    this.checkDuplicates(
      context.concepts.map((c) => c.id),
      "Concept",
      errors,
    );

    this.checkDuplicates(
      context.metrics.map((m) => m.id),
      "Metric",
      errors,
    );

    this.checkDuplicates(
      context.categories.map((c) => c.id),
      "Category",
      errors,
    );

    this.checkDuplicates(
      context.dimensions.map((d) => d.id),
      "Dimension",
      errors,
    );

    this.checkDuplicates(
      context.aliases.flatMap((a) => a.aliases),
      "Alias",
      errors,
    );

    this.checkDuplicates(
      context.benchmarks.map((b) => b.id),
      "Benchmark",
      errors,
    );

    this.checkDuplicates(
      context.capabilities.map((c) => c.id),
      "Capability",
      errors,
    );

    this.checkDuplicates(
      context.recommendations.map((r) => r.id),
      "Recommendation",
      errors,
    );

    this.checkDuplicates(
      context.sqlTemplates.map((t) => t.id),
      "SQL Template",
      errors,
    );

    return {
      valid: errors.length === 0,
      warnings: [],
      errors,
    };
  }

  private checkDuplicates(
    values: readonly string[],
    label: string,
    errors: string[],
  ) {
    const seen = new Set<string>();

    for (const value of values) {
      if (seen.has(value)) {
        errors.push(`${label} '${value}' is duplicated.`);
      }

      seen.add(value);
    }
  }
}
