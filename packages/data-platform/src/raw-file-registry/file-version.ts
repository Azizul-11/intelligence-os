/** Version of a physical file, to distinguish revisions of the same dataset over time. */
export interface FileVersion {
  /** Version identifier, e.g. 1, 2, 2025.1, 2025-Q1. */
  version: string;

  /** Indicates whether this is the latest version. */
  latest: boolean;

  /** Optional description of the version. */
  description?: string;
}