import type {
  DimensionDefinition as DomainDimensionDefinition,
} from "@intelligence/domain-sdk";

import type {
  DimensionDefinition as SemanticDimensionDefinition,
} from "@intelligence/contracts/semantic";

/**
 * Converts Domain SDK dimensions into canonical Semantic dimensions.
 */
export function loadDimensions(
  dimensions: readonly DomainDimensionDefinition[],
  domain: string,
): SemanticDimensionDefinition[] {
  return dimensions.map((dimension) => {
    if (!dimension.id) {
      throw new Error("Dimension id is required.");
    }

    if (!dimension.displayName) {
      throw new Error(
        `Dimension "${dimension.id}" is missing a display name.`,
      );
    }

    return {
      key: dimension.id,

      displayName: dimension.displayName,

      description: dimension.description ?? "",

      hierarchyLevel: dimension.hierarchyLevel,

      domain,

      enabled: true,
    };
  });
}