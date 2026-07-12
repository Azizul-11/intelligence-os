import type {
  CategoryDefinition as DomainCategoryDefinition,
} from "@intelligence/domain-sdk";

import type {
  CategoryDefinition as SemanticCategoryDefinition,
} from "@intelligence/contracts/semantic";

/**
 * Converts Domain SDK categories into canonical Semantic categories.
 */
export function loadCategories(
  categories: readonly DomainCategoryDefinition[],
  domain: string,
): SemanticCategoryDefinition[] {
  return categories.map((category) => {
    if (!category.id) {
      throw new Error("Category id is required.");
    }

    if (!category.displayName) {
      throw new Error(
        `Category "${category.id}" is missing a display name.`,
      );
    }

    return {
      key: category.id,

      displayName: category.displayName,

      description: category.description ?? "",

      domain,

      enabled: true,
    };
  });
}