/**
 * Represents a validation rule applied to incoming data.
 */
export interface ValidationRule {
  /**
   * Unique rule identifier.
   */
  id: string;

  /**
   * Human-readable rule name.
   */
  name: string;

  /**
   * Description of the rule.
   */
  description?: string;

  /**
   * Whether this rule is required.
   */
  required: boolean;
}