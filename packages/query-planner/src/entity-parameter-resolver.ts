import type { SemanticCollections } from "./semantic-collections";
import type { EntityDefinition } from "@intelligence/domain-sdk";

export class EntityParameterResolver {
  resolve(
    semantic: SemanticCollections,
  ): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

   for (const entity of semantic.entities) {
  const definition =
    entity.definition as EntityDefinition;

  const execution = definition.execution;

  if (!execution) {
    continue;
  }

  parameters[execution.parameter] =
  entity.resolvedValue ??
  entity.phrase;
}

    return parameters;
  }
}