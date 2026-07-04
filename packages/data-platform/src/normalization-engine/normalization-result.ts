import type { Timestamp } from "@intelligence/contracts";

import type { AliasMap } from "./alias-map";

/**
 * Result returned after normalization.
 */
export interface NormalizationResult {
  success: boolean;

  mappings: AliasMap[];

  normalizedFields: number;

  timestamps?: Timestamp;
}