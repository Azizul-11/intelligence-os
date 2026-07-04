import type { Timestamp } from "@intelligence/contracts";

import type { ValidationError } from "./validation-error";

/**
 * Overall validation result.
 */
export interface ValidationSummary {
  /**
   * Whether validation passed.
   */
  valid: boolean;

  /**
   * Number of executed validation rules.
   */
  totalRules: number;

  /**
   * Number of passed rules.
   */
  passed: number;

  /**
   * Number of failed rules.
   */
  failed: number;

  /**
   * Validation warnings.
   */
  warnings: number;

  /**
   * Validation issues.
   */
  errors: ValidationError[];

  /**
   * Validation timestamps.
   */
  timestamps?: Timestamp;
}