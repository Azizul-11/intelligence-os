import type { EntityDefinition } from "./entity-definition";
import type { EntityRegistration } from "./entity-registration";
import type { EntityRegistryResult } from "./entity-registry-result";

/**
 * Public API implemented by every Domain Pack.
 */
export interface EntityRegistry {
  register(
    registration: EntityRegistration,
  ): EntityRegistryResult;

  unregister(
    id: string,
  ): EntityRegistryResult;

  get(
    id: string,
  ): EntityDefinition | undefined;

  getAll(): EntityDefinition[];
}