import type { RelationshipDefinition } from "./relationship-definition";
import type { RelationshipRegistration } from "./relationship-registration";
import type { RelationshipRegistryContext } from "./relationship-registry-context";
import type { RelationshipRegistryResult } from "./relationship-registry-result";

export interface RelationshipRegistry {
  register(
    registration: RelationshipRegistration,
    context: RelationshipRegistryContext,
  ): Promise<void>;

  unregister(id: string): Promise<void>;

  get(id: string): Promise<RelationshipDefinition | undefined>;

  list(): Promise<RelationshipDefinition[]>;

  exists(id: string): Promise<boolean>;

  build(
    context: RelationshipRegistryContext,
  ): Promise<RelationshipRegistryResult>;
}