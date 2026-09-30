/** The kinds of thing an alias can resolve to. */
import type { SemanticType } from "../semantic";

export type AliasType =
  | SemanticType
  | "sql-template"
  | "recommendation";