import type { PipelineContext } from "./pipeline-context";
import type { PipelineResult } from "./pipeline-result";

/**
 * Universal pipeline runner.
 */
export interface PipelineRunner {
  /**
   * Execute a complete ingestion pipeline.
   */
  run(
    context: PipelineContext,
  ): Promise<PipelineResult>;
}