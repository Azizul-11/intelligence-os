/** A domain's own word-substitution rule, applied before phrase extraction/alias resolution runs. */
export interface LexicalRewriteRule {
  /** Literal phrase to match (word-boundary) against already-normalized text. */
  pattern: string;

  /** Literal replacement, must itself be resolvable through the domain's alias data. */
  replacement: string;
}
