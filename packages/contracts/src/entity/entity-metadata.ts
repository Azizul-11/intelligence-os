/**
 * Platform metadata associated with an entity.
 */
export interface EntityMetadata {
  /**
   * Origin of the entity.
   */
  source?: string;

  /**
   * Version of the entity definition.
   */
  version?: string;

  /**
   * User-defined tags.
   */
  tags?: string[];

  /**
   * Entity creation timestamp.
   */
  createdAt?: Date;

  /**
   * Last update timestamp.
   */
  updatedAt?: Date;
}