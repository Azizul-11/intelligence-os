import type { ValidationSummary } from "./validation-summary";
import type { ValidationContext } from "./validation-context";

/**
 * Contract for validating datasets.
 */
export interface ValidationEngine {
  /**
   * Validate schema.
   */
  validateSchema(
    context: ValidationContext,
  ): Promise<ValidationSummary>;

  /**
   * Validate required fields.
   */
  validateRequiredFields(
    context: ValidationContext,
  ): Promise<ValidationSummary>;

  /**
   * Validate data types.
   */
  validateTypes(
    context: ValidationContext,
  ): Promise<ValidationSummary>;

  /**
   * Validate duplicate records.
   */
  validateDuplicates(
    context: ValidationContext,
  ): Promise<ValidationSummary>;

  /**
   * Execute full validation pipeline.
   */
  validate(
    context: ValidationContext,
  ): Promise<ValidationSummary>;
}