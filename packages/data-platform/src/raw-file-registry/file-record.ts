import type { ID, Metadata, Timestamp } from "@intelligence/contracts";

/** Metadata about a physical file entering the platform, not the dataset contents. */
export interface FileRecord {
  /** Unique platform identifier. */
  id: ID;

  /** Original filename. */
  filename: string;

  /** File extension, e.g. csv, json, xlsx, parquet, zip. */
  extension: string;

  /** MIME type, e.g. text/csv, application/json. */
  mimeType: string;

  /** File size in bytes. */
  size: number;

  /** Current lifecycle status. */
  status:
    | "registered"
    | "validated"
    | "normalized"
    | "processed"
    | "failed";

  /** File metadata. */
  metadata?: Metadata;

  /** File timestamps. */
  timestamps?: Timestamp;
}