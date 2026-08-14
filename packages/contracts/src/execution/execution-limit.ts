/**
 * Universal execution limit.
 *
 * Represents the maximum number of results to return.
 * Domain-agnostic representation of result limiting.
 */
export interface ExecutionLimit {
  /**
   * Maximum number of records to return.
   */
  value: number;

  /**
   * Optional offset for pagination.
   */
  offset?: number;
}
