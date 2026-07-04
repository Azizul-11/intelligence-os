import type {
  Dataset,
  ID,
  Metadata,
  Timestamp,
} from "@intelligence/contracts";

import type { DatasetOwner } from "./dataset-owner";
import type { DatasetTag } from "./dataset-tag";
import type { DatasetVersion } from "./dataset-version";

/**
 * Represents a logical dataset registered in IntelligenceOS.
 */
export interface DatasetRecord {
  /**
   * Platform identifier.
   */
  id: ID;

  /**
   * Dataset definition.
   */
  dataset: Dataset;

  /**
   * Dataset owner.
   */
  owner: DatasetOwner;

  /**
   * Dataset tags.
   */
  tags?: DatasetTag[];

  /**
   * Current dataset version.
   */
  version: DatasetVersion;

  /**
   * Additional metadata.
   */
  metadata?: Metadata;

  /**
   * Lifecycle timestamps.
   */
  timestamps?: Timestamp;
}