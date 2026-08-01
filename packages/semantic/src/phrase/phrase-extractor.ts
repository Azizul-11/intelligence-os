import type { Token } from "../tokenizer";
import type { Phrase } from "./phrase";

export class PhraseExtractor {
  extract(tokens: readonly Token[]): Phrase[] {
    const phrases: Phrase[] = [];

    for (let start = 0; start < tokens.length; start++) {
      for (let end = start; end < tokens.length; end++) {
        phrases.push({
          value: tokens
            .slice(start, end + 1)
            .map((t) => t.value)
            .join(" "),
          start,
          end,
        });
      }
    }

    return phrases;
  }
}