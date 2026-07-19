export interface QueryFilter {
  field: string;

  operator: "=" | "!=" | ">" | "<" | ">=" | "<=";

  value: string | number | boolean;
}