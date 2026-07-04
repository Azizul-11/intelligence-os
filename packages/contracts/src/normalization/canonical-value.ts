/**
 * Represents the canonical representation of a platform value.
 */
export interface CanonicalValue {
  /**
   * Canonical identifier.
   */
  id: string;

  /**
   * Canonical display value.
   */
  value: string;

  /**
   * Optional description.
   */
  description?: string;
}