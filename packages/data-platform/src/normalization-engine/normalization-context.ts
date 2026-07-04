import type { Dataset } from "@intelligence/contracts";

import type { DatasetRecord } from "../dataset-registry";

/**
 * Input supplied to the Normalization Engine.
 */
export interface NormalizationContext {
  dataset: Dataset;

  registry: DatasetRecord;
}