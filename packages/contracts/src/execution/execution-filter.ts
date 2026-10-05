/** Universal, domain-agnostic constraint applied during execution. */
export interface ExecutionFilter {
  /** Field or dimension to filter on. */
  field: string;

  /** Comparison operator. */
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not_in" | "like";

  /** Value(s) to compare against. */
  value: string | number | boolean | string[] | number[];
}
