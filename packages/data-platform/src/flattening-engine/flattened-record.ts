import type { ID } from "@intelligence/contracts";

import type { FlattenedField } from "./flattened-field";

/**
 * Universal flattened record.
 */
export interface FlattenedRecord {
  /**
   * Record identifier.
   */
  id: ID;

  /**
   * Flattened fields.
   */
  fields: FlattenedField[];
}