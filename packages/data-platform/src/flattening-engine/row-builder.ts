import type { FlattenedRecord } from "./flattened-record";

/**
 * Produces universal flattened rows.
 */
export interface RowBuilder {
  /**
   * Build a flattened row.
   */
  build(record: FlattenedRecord): FlattenedRecord;
}