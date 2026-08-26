/**
 * One domain-declared rewrite rule that actually matched and fired for
 * a given query. Carries both its trigger `pattern` (the exact
 * original-text phrase, still present in the pre-rewrite token stream)
 * and its `replacement` (what phrase/candidate construction actually
 * sees) - since a fallback candidate's own phrase never appears in the
 * original text (that's what makes it a rewrite), `pattern` is the only
 * way downstream code can recover anything about the original wording
 * that produced it, e.g. an embedded ranking modifier (see RCG-020).
 */
export interface AppliedLexicalRewrite {
  pattern: string;

  replacement: string;
}

export interface RewriteResult {
  original: string;

  rewritten: string;

  /**
   * Every domain-declared rewrite rule that actually matched and fired
   * for this query (empty if none did). Lets downstream phrase/
   * candidate construction distinguish a generic-idiom-implied
   * ("fallback") occurrence of a phrase from a user-typed, explicit one
   * - without knowing which domain or metric is involved.
   */
  appliedReplacements: readonly AppliedLexicalRewrite[];
}