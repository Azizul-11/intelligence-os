// import type { SemanticType } from "../semantic";
// export type AliasType =
//   |SemanticType
//   | "entity"
//   | "metric"
//   | "dimension"
//   | "category"
//   | "benchmark"
//   | "relationship"
//   | "sql-template"
//   | "recommendation";


import type { SemanticType } from "../semantic";

export type AliasType =
  | SemanticType
  | "sql-template"
  | "recommendation";