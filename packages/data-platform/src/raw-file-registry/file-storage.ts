/** Physical storage location of a file, independent of the dataset. */
export interface FileStorage {
  /** Storage provider, e.g. local, s3, supabase, azure, gcs. */
  provider: string;

  /** Path or object key within the storage provider. */
  path: string;

  /** Optional bucket or container name. */
  bucket?: string;

  /** Optional storage region. */
  region?: string;
}