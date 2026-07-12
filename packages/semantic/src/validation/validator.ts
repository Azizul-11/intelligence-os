import type { SemanticValidationContext } from "./validation-context";
import type { SemanticValidationResult } from "./validation-result";

export interface SemanticValidator {
  validate(
    context: SemanticValidationContext,
  ): SemanticValidationResult;
}