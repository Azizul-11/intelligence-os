/**
 * Represents one flattened field.
 */
export interface FlattenedField {
  /**
   * Canonical field name.
   */
  name: string;

  /**
   * Flattened value.
   */
  value: unknown;
}