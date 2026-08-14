/**
 * Universal execution ordering.
 *
 * Represents how results should be sorted.
 * Domain-agnostic representation of ordering logic.
 */
export interface ExecutionOrdering {
  /**
   * Field or metric to order by.
   */
  field: string;

  /**
   * Sort direction.
   */
  direction: "asc" | "desc";
}
