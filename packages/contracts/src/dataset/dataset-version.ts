/**
 * Represents a dataset version.
 */
export interface DatasetVersion {
  /**
   * Version identifier.
   */
  version: string;

  /**
   * Release date.
   */
  releasedAt?: Date;
}