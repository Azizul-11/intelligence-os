import type { SemanticValidationContext } from "./validation-context";
import type { SemanticValidationResult } from "./validation-result";
import type { SemanticValidator } from "./validator";

export class SemanticValidationEngine {
  constructor(
    private readonly validators: readonly SemanticValidator[],
  ) {}

  validate(
    context: SemanticValidationContext,
  ): SemanticValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const validator of this.validators) {
      const result = validator.validate(context);

      warnings.push(...result.warnings);
      errors.push(...result.errors);
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }
}