import type {
  RelationshipDefinition as DomainRelationshipDefinition,
} from "@intelligence/domain-sdk";

import type {
  RelationshipDefinition as SemanticRelationshipDefinition,
} from "@intelligence/contracts/semantic";

/**
 * Converts Domain SDK relationships into canonical Semantic relationships.
 */
export function loadRelationships(
  relationships: readonly DomainRelationshipDefinition[],
  domain: string,
): SemanticRelationshipDefinition[] {
  return relationships.map((relationship) => {
    if (!relationship.sourceEntity) {
      throw new Error("Relationship source entity is required.");
    }

    if (!relationship.targetEntity) {
      throw new Error("Relationship target entity is required.");
    }

    return {
      source: relationship.sourceEntity,

      target: relationship.targetEntity,

      relationship: relationship.type,

      description: relationship.description ?? "",

      domain,

      enabled: true,
    };
  });
}