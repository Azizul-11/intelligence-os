import type { Dataset } from "@intelligence/contracts";

import type { DatasetRecord } from "../dataset-registry";
import type { EntityCandidate } from "./entity-candidate";

/**
 * Input for entity resolution.
 */
export interface EntityResolutionContext {
  /**
   * Dataset being processed.
   */
  dataset: Dataset;

  /**
   * Dataset registry entry.
   */
  registry: DatasetRecord;

  /**
   * Candidates discovered during ingestion.
   */
  candidates: EntityCandidate[];
}