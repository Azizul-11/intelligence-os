import type { SemanticValidationContext } from "./validation-context";
import type { SemanticValidationResult } from "./validation-result";
import type { SemanticValidator } from "./validator";

export class ReferenceValidator
  implements SemanticValidator
{
  validate(
    context: SemanticValidationContext,
  ): SemanticValidationResult {
    const errors: string[] = [];

    const entityKeys = new Set(
      context.entities.map((e) => e.key),
    );

    const metricKeys = new Set(
      context.metrics.map((m) => m.key),
    );

    const benchmarkKeys = new Set(
      context.benchmarks.map((b) => b.key),
    );

    //
    // Alias references
    //

    for (const alias of context.aliases) {
      switch (alias.type.toUpperCase()) {
        case "ENTITY":
          if (!entityKeys.has(alias.canonicalKey)) {
            errors.push(
              `Alias '${alias.alias}' references unknown entity '${alias.canonicalKey}'.`,
            );
          }
          break;

        case "METRIC":
          if (!metricKeys.has(alias.canonicalKey)) {
            errors.push(
              `Alias '${alias.alias}' references unknown metric '${alias.canonicalKey}'.`,
            );
          }
          break;

        case "BENCHMARK":
          if (!benchmarkKeys.has(alias.canonicalKey)) {
            errors.push(
              `Alias '${alias.alias}' references unknown benchmark '${alias.canonicalKey}'.`,
            );
          }
          break;
      }
    }

    return {
      valid: errors.length === 0,
      warnings: [],
      errors,
    };
  }
}