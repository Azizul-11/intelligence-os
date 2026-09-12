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
  // Singular forms ("Best Hospital in ALBANY county") - same idiom, same
  // fallback metric; only the plural forms were previously registered.
  { pattern: "highest rated hospital", replacement: "hospital overall rating" },
  { pattern: "lowest rated hospital", replacement: "hospital overall rating" },
  { pattern: "best hospital", replacement: "hospital overall rating" },
  { pattern: "worst hospital", replacement: "hospital overall rating" },
  { pattern: "top hospital", replacement: "hospital overall rating" },
  { pattern: "top rated hospital", replacement: "hospital overall rating" },
  { pattern: "bottom rated hospital", replacement: "hospital overall rating" },
  // Direct metric-name plural ("Birmingham Alabama overall ratings") -
  // distinct from the ranking-idiom rules above: aliases/hospital-overall-
  // rating.ts registers "Overall Rating" (singular) as a direct alias, but
  // never its plural. Deliberately NOT registering a bare "ratings" rule
  // here too: aliases/safety-performance.ts registers "safety rating" -
  // a bare "ratings" rewrite would also fire inside "safety ratings"
  // (word-boundary regex, no phrase awareness), silently redirecting a
  // safety-performance query to hospital-overall-rating instead of
  // failing cleanly. "overall ratings" is specific enough to carry no
  // such collision.
  { pattern: "overall ratings", replacement: "hospital overall rating" },
];
