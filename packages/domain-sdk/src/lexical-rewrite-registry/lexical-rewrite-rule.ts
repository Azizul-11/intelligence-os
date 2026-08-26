export interface LexicalRewriteRule {
  /**
   * Literal phrase to match (word-boundary), against already-normalized
   * text - before generic modifier words are stripped and before phrase
   * extraction/alias resolution runs.
   */
  pattern: string;

  /**
   * Literal replacement phrase. Must itself be resolvable through the
   * domain's own alias data once phrase extraction runs.
   */
  replacement: string;
}
