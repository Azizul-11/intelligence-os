import type { Timestamp } from "@intelligence/contracts";

import type { FlattenedRecord } from "./flattened-record";

/**
 * Result returned by the Flattening Engine.
 */
export interface FlatteningResult {
  /**
   * Processing status.
   */
  success: boolean;

  /**
   * Flattened records.
   */
  records: FlattenedRecord[];

  /**
   * Number of generated rows.
   */
  rowCount: number;

  /**
   * Processing timestamps.
   */
  timestamps?: Timestamp;
}