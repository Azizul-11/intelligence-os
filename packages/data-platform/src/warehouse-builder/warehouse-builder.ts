import type { WarehouseContext } from "./warehouse-context";
import type { WarehouseResult } from "./warehouse-result";

/**
 * Contract for building warehouse data.
 */
export interface WarehouseBuilder {
  /**
   * Build warehouse data.
   */
  build(
    context: WarehouseContext,
  ): Promise<WarehouseResult>;

  /**
   * Build multiple warehouse batches.
   */
  buildBatch(
    contexts: WarehouseContext[],
  ): Promise<WarehouseResult[]>;
}