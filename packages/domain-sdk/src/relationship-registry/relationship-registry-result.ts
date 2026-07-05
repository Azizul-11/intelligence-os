import type { RelationshipDefinition } from "./relationship-definition";

export interface RelationshipRegistryResult {
  success: boolean;

  relationships: RelationshipDefinition[];

  warnings?: string[];

  errors?: string[];
}