import type { FlatteningContext } from "./flattening-context";
import type { FlatteningResult } from "./flattening-result";

/**
 * Contract for the Flattening Engine.
 */
export interface FlatteningEngine {
  /**
   * Flatten a dataset.
   */
  flatten(
    context: FlatteningContext,
  ): Promise<FlatteningResult>;

  /**
   * Flatten multiple datasets.
   */
  flattenBatch(
    contexts: FlatteningContext[],
  ): Promise<FlatteningResult[]>;
}