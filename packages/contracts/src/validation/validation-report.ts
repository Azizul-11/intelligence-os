import type { ValidationResult } from "./validation-result";

/**
 * Aggregated validation results for a dataset.
 */
export interface ValidationReport {
  /**
   * Overall validation status.
   */
  valid: boolean;

  /**
   * Individual rule results.
   */
  results: ValidationResult[];
}