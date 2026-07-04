import type { Timestamp } from "@intelligence/contracts";

import type { WarehouseBatch } from "./warehouse-batch";

/**
 * Warehouse Builder result.
 */
export interface WarehouseResult {
  success: boolean;

  batch: WarehouseBatch;

  timestamps?: Timestamp;
}