/** A single field/operator/value filter constraint on a query. */
export interface QueryFilter {
  field: string;

  operator: "=" | "!=" | ">" | "<" | ">=" | "<=";

  value: string | number | boolean;
}