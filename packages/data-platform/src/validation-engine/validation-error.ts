import type { ID } from "@intelligence/contracts";

import type { ValidationLevel } from "./validation-level";

/**
 * Represents a single validation issue.
 */
export interface ValidationError {
  /**
   * Unique validation identifier.
   */
  id: ID;

  /**
   * Machine-readable error code.
   */
  code: string;

  /**
   * Human-readable message.
   */
  message: string;

  /**
   * Validation severity.
   */
  level: ValidationLevel;

  /**
   * Optional field name.
   */
  field?: string;

  /**
   * Optional row number.
   */
  row?: number;
}