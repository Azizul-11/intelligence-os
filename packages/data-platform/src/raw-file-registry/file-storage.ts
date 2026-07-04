/**
 * Represents the physical storage location of a file.
 *
 * The storage location is independent of the dataset itself
 * and abstracts where the file is stored.
 */
export interface FileStorage {
  /**
   * Storage provider.
   *
   * Examples:
   * - local
   * - s3
   * - supabase
   * - azure
   * - gcs
   */
  provider: string;

  /**
   * Path or object key within the storage provider.
   */
  path: string;

  /**
   * Optional bucket or container name.
   */
  bucket?: string;

  /**
   * Optional storage region.
   */
  region?: string;
}