import { Tokenizer } from "../tokenizer";

import type { AnalyzedToken } from "./analyzed-token";

import {
  MODIFIERS,
  OPERATORS,
  STOPWORDS,
  NEGATORS,
} from "./lexicon";

export class SemanticAnalyzer {
  constructor(
    private readonly tokenizer = new Tokenizer(),
  ) {}

  analyze(text: string): AnalyzedToken[] {
    const tokens =
      this.tokenizer.tokenize(text);

    return tokens.map((token) => ({
      token,
      role: this.classify(token.value),
    }));
  }

  private classify(value: string) {
    if (MODIFIERS.has(value)) {
      return "modifier";
    }

    if (OPERATORS.has(value)) {
      return "operator";
    }

    if (NEGATORS.has(value)) {
      return "negator";
    }

    if (!Number.isNaN(Number(value))) {
      return "number";
    }

    if (STOPWORDS.has(value)) {
      return "unknown";
    }

    return "noun";
  }
}