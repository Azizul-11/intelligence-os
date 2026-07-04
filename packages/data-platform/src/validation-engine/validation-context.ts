import type {
  Dataset,
  Metadata,
} from "@intelligence/contracts";

import type { FileRecord } from "../raw-file-registry";

/**
 * Context supplied to the Validation Engine.
 */
export interface ValidationContext {
  /**
   * Dataset being validated.
   */
  dataset: Dataset;

  /**
   * Physical file.
   */
  file: FileRecord;

  /**
   * Optional schema definition.
   */
  schema?: Record<string, unknown>;

  /**
   * Additional metadata.
   */
  metadata?: Metadata;
}