import type { EntityIdentifier } from "./entity-identifier";
import type { EntityKind } from "./entity-kind";
import type { EntityMetadata } from "./entity-metadata";
import type { EntityReference } from "./entity-reference";

/**
 * Universal representation of a real-world object within IntelligenceOS.
 *
 * Every domain (Healthcare, Education, Finance, Manufacturing, etc.)
 * models its business objects using this contract.
 */
export interface Entity {
  /**
   * Unique platform identifier.
   */
  identifier: EntityIdentifier;

  /**
   * High-level platform classification.
   */
  kind: EntityKind;

  /**
   * Human-readable display name.
   */
  name: string;

  /**
   * Platform metadata.
   */
  metadata?: EntityMetadata;

  /**
   * References to other entities.
   */
  references?: EntityReference[];
}