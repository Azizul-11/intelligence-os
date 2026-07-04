import type { DatasetMetadata } from "./dataset-metadata";
import type { DatasetSchema } from "./dataset-schema";
import type { DatasetSource } from "./dataset-source";
import type { DatasetVersion } from "./dataset-version";

/**
 * Represents a dataset available to the platform.
 */
export interface Dataset {
  /**
   * Dataset identifier.
   */
  id: string;

  /**
   * Dataset name.
   */
  name: string;

  /**
   * Dataset source.
   */
  source: DatasetSource;

  /**
   * Dataset version.
   */
  version: DatasetVersion;

  /**
   * Dataset schema.
   */
  schema?: DatasetSchema;

  /**
   * Additional metadata.
   */
  metadata?: DatasetMetadata;
}