import { MODIFIERS } from "../analyzer/lexicon";

import type { LexicalRewriteRule } from "@intelligence/domain-sdk";

import type { AppliedLexicalRewrite, RewriteResult } from "./rewrite-result";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Generic text-rewrite engine that executes the rules a Domain SDK declares (LexicalRewriteRule); holds no domain vocabulary, zero rules is valid. */
export class LexicalRewriter {
  constructor(
    private readonly rules: readonly LexicalRewriteRule[] = [],
  ) {}

  rewrite(
    text: string,
  ): RewriteResult {

    let rewritten = text;
    const appliedReplacements: AppliedLexicalRewrite[] = [];

    for (const rule of this.rules) {
      const before = rewritten;

      rewritten = rewritten.replace(
        new RegExp(`\\b${escapeRegExp(rule.pattern)}\\b`, "g"),
        rule.replacement,
      );

      if (rewritten !== before) {
        appliedReplacements.push({
          pattern: rule.pattern,
          replacement: rule.replacement,
        });
      }
    }

    rewritten = rewritten
      .split(" ")
      .filter(
        (word) => !MODIFIERS.has(word),
      )
      .join(" ");

    return {
      original: text,
      rewritten,
      appliedReplacements,
    };
  }
}