/** Universal maximum number of results to return. */
export interface ExecutionLimit {
  /** Maximum number of records to return. */
  value: number;

  /** Optional offset for pagination. */
  offset?: number;
}
