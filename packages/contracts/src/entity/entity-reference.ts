/**
 * Reference to another entity within the platform.
 */
export interface EntityReference {
  /**
   * Target entity identifier.
   */
  entityId: string;

  /**
   * Type of relationship.
   *
   * Examples:
   * - located_in
   * - belongs_to
   * - managed_by
   * - works_at
   */
  relationship: string;
}