import type { Dataset } from "@intelligence/contracts";

import type { FileRecord } from "../raw-file-registry";

/**
 * Pipeline execution input.
 */
export interface PipelineContext {
  file: FileRecord;

  dataset: Dataset;
}