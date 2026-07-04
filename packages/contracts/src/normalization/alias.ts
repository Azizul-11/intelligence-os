/**
 * Represents an alternative name for a canonical value.
 */
export interface Alias {
  /**
   * Alias value found in source data.
   */
  value: string;

  /**
   * Canonical platform value.
   */
  canonical: string;
}