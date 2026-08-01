import type { Token } from "../tokenizer";

export type TokenRole =
  | "unknown"
  | "noun"
  | "modifier"
  | "number"
  | "operator";

export interface AnalyzedToken {
  token: Token;

  role: TokenRole;
}