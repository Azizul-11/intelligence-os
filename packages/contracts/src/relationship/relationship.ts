import type { EntityIdentifier } from "../entity";
import { RelationshipDirection } from "./relationship-direction";
import { RelationshipType } from "./relationship-type";

/**
 * Represents a relationship between two platform entities.
 */
export interface Relationship {
  /**
   * Source entity.
   */
  source: EntityIdentifier;

  /**
   * Target entity.
   */
  target: EntityIdentifier;

  /**
   * Semantic relationship type.
   */
  type: RelationshipType;

  /**
   * Relationship direction.
   */
  direction: RelationshipDirection;
}