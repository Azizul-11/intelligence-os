import { MODIFIERS } from "../analyzer/lexicon";

import type { RewriteResult } from "./rewrite-result";

export class LexicalRewriter {
  rewrite(
    text: string,
  ): RewriteResult {

    let rewritten = text;

    rewritten = rewritten.replace(
      /\bhighest rated hospitals\b/g,
      "hospital overall rating",
    );

    rewritten = rewritten.replace(
      /\bbest hospitals\b/g,
      "hospital overall rating",
    );

    rewritten = rewritten.replace(
      /\btop hospitals\b/g,
      "hospital overall rating",
    );

    rewritten = rewritten
      .split(" ")
      .filter(
        (word) => !MODIFIERS.has(word),
      )
      .join(" ");

    return {
      original: text,
      rewritten,
    };
  }
}