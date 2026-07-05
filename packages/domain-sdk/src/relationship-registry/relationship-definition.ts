import type { RelationshipCardinality } from "./relationship-cardinality";
import type { RelationshipType } from "./relationship-type";

export interface RelationshipDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  sourceEntity: string;

  targetEntity: string;

  type: RelationshipType;

  cardinality: RelationshipCardinality;
}