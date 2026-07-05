import type { EntityCategory } from "./entity-category";

/**
 * Describes an entity exposed by a Domain Pack.
 */
export interface EntityDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  category?: EntityCategory;
}