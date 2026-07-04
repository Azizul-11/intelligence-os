import type { ID } from "@intelligence/contracts";

import type { DatasetRecord } from "./dataset-record";

/**
 * Contract for managing datasets.
 */
export interface DatasetRegistry {
  /**
   * Register a dataset.
   */
  register(dataset: DatasetRecord): Promise<void>;

  /**
   * Update an existing dataset.
   */
  update(dataset: DatasetRecord): Promise<void>;

  /**
   * Remove a dataset.
   */
  remove(id: ID): Promise<void>;

  /**
   * Find a dataset by identifier.
   */
  find(id: ID): Promise<DatasetRecord | null>;

  /**
   * List all datasets.
   */
  list(): Promise<DatasetRecord[]>;
}