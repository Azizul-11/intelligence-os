import type { LexicalRewriteRule } from "@intelligence/domain-sdk";

/**
 * Healthcare's generic ranking idiom: "highest rated / best / top
 * hospitals" (and their mirror-image, ascending-direction phrasings:
 * "lowest rated / worst / bottom rated hospitals") imply
 * hospital-overall-rating as a fallback metric when no other metric is
 * named. The replacement phrase is itself one of
 * hospital-overall-rating's own registered aliases (see
 * aliases/hospital-overall-rating.ts). Universal Core executes these
 * rules generically - see packages/semantic/src/rewriter/lexical-rewriter.ts.
 * Direction itself is resolved separately and already symmetrically by
 * the Universal ModifierDirectionResolver/ASCENDING_MODIFIERS/
 * DESCENDING_MODIFIERS - these rules only need to ensure the metric
 * candidate exists in the first place for both directions equally.
 */
export const healthcareLexicalRewrites: readonly LexicalRewriteRule[] = [
  { pattern: "highest rated hospitals", replacement: "hospital overall rating" },
  { pattern: "lowest rated hospitals", replacement: "hospital overall rating" },
  { pattern: "best hospitals", replacement: "hospital overall rating" },
  { pattern: "worst hospitals", replacement: "hospital overall rating" },
  { pattern: "top hospitals", replacement: "hospital overall rating" },
  { pattern: "top rated hospitals", replacement: "hospital overall rating" },
  { pattern: "bottom rated hospitals", replacement: "hospital overall rating" },
];
