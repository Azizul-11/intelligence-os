import type { Token } from "./token";

export class Tokenizer {
  tokenize(text: string): Token[] {
    return text
      .split(" ")
      .filter(Boolean)
      .map((value, position) => ({
        value,
        position,
      }));
  }
}