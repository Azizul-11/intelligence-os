/** Universal, domain-agnostic result sorting. */
export interface ExecutionOrdering {
  /** Field or metric to order by. */
  field: string;

  /** Sort direction. */
  direction: "asc" | "desc";
}
