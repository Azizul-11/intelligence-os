import type { SemanticValidationContext } from "./validation-context";
import type { SemanticValidationResult } from "./validation-result";
import type { SemanticValidator } from "./validator";

export class DuplicateValidator
  implements SemanticValidator
{
  validate(
    context: SemanticValidationContext,
  ): SemanticValidationResult {
    const errors: string[] = [];

    this.checkDuplicates(
      context.entities.map((e) => e.key),
      "Entity",
      errors,
    );

    this.checkDuplicates(
      context.metrics.map((m) => m.key),
      "Metric",
      errors,
    );

    this.checkDuplicates(
      context.categories.map((c) => c.key),
      "Category",
      errors,
    );

    this.checkDuplicates(
      context.dimensions.map((d) => d.key),
      "Dimension",
      errors,
    );

    this.checkDuplicates(
      context.aliases.map((a) => a.alias),
      "Alias",
      errors,
    );

    this.checkDuplicates(
      context.benchmarks.map((b) => b.key),
      "Benchmark",
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