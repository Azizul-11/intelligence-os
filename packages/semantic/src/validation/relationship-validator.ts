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
      context.entities.map((entity) => entity.id),
    );

    for (const relationship of context.relationships) {
      if (!entityKeys.has(relationship.sourceEntity)) {
        errors.push(
  `Relationship references unknown source entity '${relationship.sourceEntity}'.`,
);
      }

      if (!entityKeys.has(relationship.targetEntity)) {
        errors.push(
  `Relationship references unknown target entity '${relationship.targetEntity}'.`,
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