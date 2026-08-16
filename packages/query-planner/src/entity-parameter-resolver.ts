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

    // Phase 7.5.3: multiple entities that resolve to different values
    // under the same execution parameter (e.g. two distinct canonical
    // identities of the same entity type) must all survive - not
    // silently collapse to whichever was seen last. A parameter with
    // exactly one distinct value keeps the original scalar shape
    // (unchanged behavior); more than one distinct value becomes an
    // array, preserving every canonical identity.
    for (const [parameter, values] of groupEntityValues(entries)) {
      parameters[parameter] = values.length === 1 ? values[0] : values;
    }

    return parameters;
  }
}