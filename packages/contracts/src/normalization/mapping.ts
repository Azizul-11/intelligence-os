import type { Alias } from "./alias";
import type { NormalizedField } from "./normalized-field";

/**
 * Represents a normalization mapping.
 */
export interface Mapping {
  /**
   * Field normalization.
   */
  field: NormalizedField;

  /**
   * Supported aliases.
   */
  aliases?: Alias[];
}