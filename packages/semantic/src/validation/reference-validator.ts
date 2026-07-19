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
      context.entities.map((e) => e.id),
    );

    const metricKeys = new Set(
     context.metrics.map((m) => m.id),
    );

    const benchmarkKeys = new Set(
      context.benchmarks.map((b) => b.id),
    );

    const conceptKeys = new Set(
  context.concepts.map((c) => c.id),
);

    //
    // Alias references
    //

    for (const alias of context.aliases) {
      switch (alias.type.toUpperCase()) {
        case "ENTITY":
          if (!entityKeys.has(alias.canonical)) {
            errors.push(
              `Alias '${alias.aliases.join(", ")}' references unknown entity '${alias.canonical}'.`,
            );
          }
          break;

        case "METRIC":
          if (!metricKeys.has(alias.canonical)) {
            errors.push(
              `Alias '${alias.aliases.join(", ")}' references unknown metric '${alias.canonical}'.`,
            );
          }
          break;

        case "BENCHMARK":
          if (!benchmarkKeys.has(alias.canonical)) {
            errors.push(
              `Alias '${alias.aliases.join(", ")}' references unknown benchmark '${alias.canonical}'.`,
            );
          }
          break;

          case "CONCEPT":
  if (!conceptKeys.has(alias.canonical)) {
    errors.push(
      `Alias '${alias.aliases.join(", ")}' references unknown concept '${alias.canonical}'.`,
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