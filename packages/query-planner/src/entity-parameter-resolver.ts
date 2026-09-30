/** Resolves execution parameters from resolved entities, grouping same-parameter entities into an array when there are multiple. */
import type { SemanticCollections } from "./semantic-collections";
import type { EntityDefinition } from "@intelligence/domain-sdk";
import { groupEntityValues } from "./group-entity-values";

export class EntityParameterResolver {
  resolve(
    semantic: SemanticCollections,
  ): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

    const entries: { key: string; value: unknown }[] = [];

   for (const entity of semantic.entities) {
  const definition =
    entity.definition as EntityDefinition;

  const execution = definition.execution;

  if (!execution) {
    continue;
  }

  entries.push({
    key: execution.parameter,
    value: entity.resolvedValue ?? entity.phrase,
  });
}

    // Phase 7.5.3: two entities under the same parameter must both survive, not collapse to the last one seen.
    for (const [parameter, values] of groupEntityValues(entries)) {
      parameters[parameter] = values.length === 1 ? values[0] : values;
    }

    return parameters;
  }
}