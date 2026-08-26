import { MODIFIERS } from "../analyzer/lexicon";

import type { LexicalRewriteRule } from "@intelligence/domain-sdk";

import type { AppliedLexicalRewrite, RewriteResult } from "./rewrite-result";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generic, domain-agnostic text-rewrite engine. Executes whatever rules
 * a Domain SDK declares (see LexicalRewriteRule) - it never contains
 * domain vocabulary itself. A domain with no generic ranking idiom to
 * express may construct this with zero rules.
 */
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