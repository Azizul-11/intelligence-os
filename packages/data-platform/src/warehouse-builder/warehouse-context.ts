import type { Dataset } from "@intelligence/contracts";

import type { FlattenedRecord } from "../flattening-engine";
import type { DatasetRecord } from "../dataset-registry";

/**
 * Input supplied to the Warehouse Builder.
 */
export interface WarehouseContext {
  dataset: Dataset;

  registry: DatasetRecord;

  records: FlattenedRecord[];
}