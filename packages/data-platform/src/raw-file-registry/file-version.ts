/**
 * Represents the version of a physical file.
 *
 * File versions allow the platform to distinguish
 * different revisions of the same dataset over time.
 */
export interface FileVersion {
  /**
   * Version identifier.
   *
   * Examples:
   * - 1
   * - 2
   * - 2025.1
   * - 2025-Q1
   */
  version: string;

  /**
   * Indicates whether this is the latest version.
   */
  latest: boolean;

  /**
   * Optional description of the version.
   */
  description?: string;
}