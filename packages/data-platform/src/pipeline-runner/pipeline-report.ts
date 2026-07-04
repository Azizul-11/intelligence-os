import type { Timestamp } from "@intelligence/contracts";

import type { PipelineStage } from "./pipeline-stage";
import type { PipelineStatus } from "./pipeline-status";

/**
 * Execution report for a pipeline stage.
 */
export interface PipelineReport {
  stage: PipelineStage;

  status: PipelineStatus;

  durationMs?: number;

  timestamps?: Timestamp;
}