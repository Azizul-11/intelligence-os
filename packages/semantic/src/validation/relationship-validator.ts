import type { SemanticValidationContext } from "./validation-context";
import type { SemanticValidationResult } from "./validation-result";
import type { SemanticValidator } from "./validator";

export class RelationshipValidator
  implements SemanticValidator
{
  validate(
    context: SemanticValidationContext,
  ): SemanticValidationResult {
    const errors: string[] = [];

    const entityKeys = new Set(
      context.entities.map((entity) => entity.key),
    );

    for (const relationship of context.relationships) {
      if (!entityKeys.has(relationship.source)) {
        errors.push(
          `Relationship references unknown source entity '${relationship.source}'.`,
        );
      }

      if (!entityKeys.has(relationship.target)) {
        errors.push(
          `Relationship references unknown target entity '${relationship.target}'.`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      warnings: [],
      errors,
    };
  }
}