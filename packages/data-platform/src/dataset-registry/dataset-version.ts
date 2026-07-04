import type { Timestamp } from "@intelligence/contracts";

/**
 * Represents a logical version of a dataset.
 */
export interface DatasetVersion {
  /**
   * Version identifier.
   *
   * Examples:
   * v1
   * 2025-Q1
   * 2.0.1
   */
  version: string;

  /**
   * Optional release notes.
   */
  notes?: string;

  /**
   * Version timestamps.
   */
  timestamps?: Timestamp;
}