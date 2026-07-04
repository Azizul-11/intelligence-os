import type { PipelineReport } from "./pipeline-report";
import type { PipelineStatus } from "./pipeline-status";

/**
 * Final pipeline execution result.
 */
export interface PipelineResult {
  status: PipelineStatus;

  reports: PipelineReport[];
}