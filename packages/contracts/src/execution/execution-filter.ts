/**
 * Universal execution filter.
 *
 * Represents a constraint that must be applied during execution.
 * Domain-agnostic representation of filtering logic.
 */
export interface ExecutionFilter {
  /**
   * Field or dimension to filter on.
   */
  field: string;

  /**
   * Comparison operator.
   */
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not_in" | "like";

  /**
   * Value(s) to compare against.
   */
  value: string | number | boolean | string[] | number[];
}
