/**
 * Result of evaluating a validation rule.
 */
export interface ValidationResult {
  /**
   * Identifier of the evaluated rule.
   */
  ruleId: string;

  /**
   * Whether the rule passed.
   */
  passed: boolean;

  /**
   * Optional validation message.
   */
  message?: string;
}