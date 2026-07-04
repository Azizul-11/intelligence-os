import type { WarehouseRecord } from "./warehouse-record";

/**
 * Collection of warehouse records.
 */
export interface WarehouseBatch {
  records: WarehouseRecord[];
}