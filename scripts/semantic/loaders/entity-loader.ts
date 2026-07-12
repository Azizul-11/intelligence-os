import type {
  EntityDefinition as DomainEntityDefinition,
} from "@intelligence/domain-sdk";

import type {
  EntityDefinition as SemanticEntityDefinition,
} from "@intelligence/contracts/semantic";

/**
 * Converts Domain SDK entities into canonical Semantic entities.
 */
export function loadEntities(
  entities: readonly DomainEntityDefinition[],
  domain: string,
): SemanticEntityDefinition[] {
  return entities.map((entity) => {
    if (!entity.id) {
      throw new Error("Entity id is required.");
    }

    if (!entity.displayName) {
      throw new Error(`Entity "${entity.id}" is missing a display name.`);
    }

    return {
      key: entity.id,

      displayName: entity.displayName,

      description: entity.description ?? "",

      category: entity.category ?? "general",

      domain,

      enabled: true,
    };
  });
}