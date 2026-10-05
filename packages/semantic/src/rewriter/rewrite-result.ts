/** A domain rewrite rule that fired: `pattern` (original wording) and `replacement`; since a fallback phrase is absent from the original text, `pattern` is how downstream recovers its modifier (RCG-020). */
export interface AppliedLexicalRewrite {
  pattern: string;

  replacement: string;
}

export interface RewriteResult {
  original: string;

  rewritten: string;

  /** Every rewrite rule that fired (empty if none); distinguishes a generic-idiom (fallback) phrase from an explicit user-typed one. */
  appliedReplacements: readonly AppliedLexicalRewrite[];
}