import type { RelationshipDefinition } from "./relationship-definition";

export interface RelationshipRegistration {
  relationship: RelationshipDefinition;

  enabled?: boolean;

  metadata?: Record<string, unknown>;
}