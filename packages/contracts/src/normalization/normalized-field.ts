/**
 * Represents a normalized field in the platform.
 */
export interface NormalizedField {
  /**
   * Source field name.
   */
  sourceField: string;

  /**
   * Canonical platform field.
   */
  targetField: string;
}