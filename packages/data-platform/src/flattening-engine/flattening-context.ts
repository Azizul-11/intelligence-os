import type { Dataset } from "@intelligence/contracts";

import type { DatasetRecord } from "../dataset-registry";

/**
 * Input supplied to the Flattening Engine.
 */
export interface FlatteningContext {
  /**
   * Dataset being flattened.
   */
  dataset: Dataset;

  /**
   * Dataset registry entry.
   */
  registry: DatasetRecord;
}