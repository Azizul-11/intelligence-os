import type { EntityDefinition } from "./entity-definition";

/**
 * Registers an entity with the Domain Registry.
 */
export interface EntityRegistration {
  entity: EntityDefinition;

  enabled: boolean;
}