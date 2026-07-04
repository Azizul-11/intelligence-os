/**
 * Represents a platform-wide identifier for an entity.
 */
export interface EntityIdentifier {
  /**
   * Canonical IntelligenceOS identifier.
   */
  id: string;

  /**
   * External identifiers from third-party systems.
   */
  externalIds?: Record<string, string>;
}