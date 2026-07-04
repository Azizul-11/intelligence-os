import type { ID, Metadata, Timestamp } from "@intelligence/contracts";

/**
 * Represents a physical file entering the IntelligenceOS platform.
 *
 * A FileRecord contains metadata about the file itself,
 * not the contents of the dataset.
 */
export interface FileRecord {
  /**
   * Unique platform identifier.
   */
  id: ID;

  /**
   * Original filename.
   */
  filename: string;

  /**
   * File extension.
   *
   * Examples:
   * csv
   * json
   * xlsx
   * parquet
   * zip
   */
  extension: string;

  /**
   * MIME type.
   *
   * Example:
   * text/csv
   * application/json
   */
  mimeType: string;

  /**
   * File size in bytes.
   */
  size: number;

  /**
   * Current lifecycle status.
   */
  status:
    | "registered"
    | "validated"
    | "normalized"
    | "processed"
    | "failed";

  /**
   * File metadata.
   */
  metadata?: Metadata;

  /**
   * File timestamps.
   */
  timestamps?: Timestamp;
}