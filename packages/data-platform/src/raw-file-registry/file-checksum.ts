/**
 * Represents a deterministic checksum for a physical file.
 *
 * Checksums allow the platform to detect duplicate files,
 * verify integrity, and identify file changes.
 */
export interface FileChecksum {
  /**
   * Hashing algorithm used.
   *
   * Examples:
   * - sha256
   * - sha512
   * - md5
   */
  algorithm: string;

  /**
   * Generated checksum value.
   */
  value: string;
}