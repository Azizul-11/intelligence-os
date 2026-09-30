/** The shape of query an SQL template answers. */
export type SqlTemplateType =
  | "lookup"
  | "aggregation"
  | "comparison"
  | "ranking"
  | "trend"
  | "summary"
  | "detail"
  | "custom";