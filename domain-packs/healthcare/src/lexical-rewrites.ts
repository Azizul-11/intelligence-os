import type { LexicalRewriteRule } from "@intelligence/domain-sdk";

/** Generic ranking idiom ("highest rated / best / top hospitals" and ascending mirrors) implies hospital-overall-rating when no metric is named;
 * direction is resolved separately by the Universal ModifierDirectionResolver, rules run via packages/semantic/src/rewriter/lexical-rewriter.ts. */
export const healthcareLexicalRewrites: readonly LexicalRewriteRule[] = [
  { pattern: "highest rated hospitals", replacement: "hospital overall rating" },
  { pattern: "lowest rated hospitals", replacement: "hospital overall rating" },
  // 2,000 sweep (Batch D): before "best hospitals", so the whole phrase is one resolved span (see the grouping rules below).
  { pattern: "break down the best hospitals", replacement: "hospital overall rating" },
  { pattern: "break down the top hospitals", replacement: "hospital overall rating" },
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
  // Bug G (Phase 3.3): "strongest" is a synonym of this idiom; without the rule "strongest hospitals" resolves only the non-rankable hospital-list metric.
  // "strong" is NOT registered: it collides with "STRONG MEMORIAL HOSPITAL" (see query-intent-detector.ts).
  { pattern: "strongest hospitals", replacement: "hospital overall rating" },
  { pattern: "strongest hospital", replacement: "hospital overall rating" },
  // Plural "overall ratings" only: a bare "ratings" rule would also fire inside "safety ratings" (word-boundary regex) and redirect safety-performance to overall rating.
  { pattern: "overall ratings", replacement: "hospital overall rating" },
  // 2,000 sweep (Batch B): "do tribal hospitals have ratings" names the overall rating with no measure word; it reached the
  // model, whose answer ("ratings" unsupported vs a rewrite) flipped with the ownership words added to the prompt.
  { pattern: "have ratings", replacement: "have hospital overall rating" },
  // 2,000 sweep (Batch C): "Is Mayo Clinic good on overall mortality?" is the hospital-wide rate (a named hospital skips the
  // front door, so no phrase group sees it); direction-free, so the words around it keep their meaning.
  { pattern: "overall mortality", replacement: "hospital wide mortality" },
  // Batch 4: metric-less ranking phrasings and "for each <unit>" grouping use the same fallback metric (a named metric still wins).
  // No "hospitals lead ...": "lead" cannot be a ranking word (hospital "MONUMENT HEALTH LEAD-DEADWOOD").
  { pattern: "hospitals ranked", replacement: "hospital overall rating" },
  { pattern: "hospital comes out on top", replacement: "hospital overall rating" },
  { pattern: "best experience", replacement: "patient experience" },
  { pattern: "for each state", replacement: "by state" },
  { pattern: "for each county", replacement: "by county" },
  // 2,000 sweep (Batch D): more grouping wordings (and "break down the best hospitals" at the top). Each left a word
  // unresolved ("break down", "view"), so the question went to the model, which dropped the grouping.
  { pattern: "state by state view", replacement: "by state" },
  { pattern: "state by state", replacement: "by state" },
  // Batch 5B-4: emergency-services flag after "hospitals" is rewritten to the ownership-word position the planner answers, like "non-profit hospitals in Ohio".
  { pattern: "hospitals with emergency services", replacement: "emergency services hospitals" },
  { pattern: "hospitals that provide emergency services", replacement: "emergency services hospitals" },
  { pattern: "hospitals that offer emergency services", replacement: "emergency services hospitals" },
  { pattern: "hospitals providing emergency services", replacement: "emergency services hospitals" },
  { pattern: "hospitals offering emergency services", replacement: "emergency services hospitals" },
  { pattern: "hospitals provide emergency services", replacement: "emergency services hospitals" },
  { pattern: "hospitals offer emergency services", replacement: "emergency services hospitals" },
  { pattern: "that provide emergency services", replacement: "emergency services" },
  { pattern: "that offer emergency services", replacement: "emergency services" },
  { pattern: "with emergency services", replacement: "emergency services" },
];

/** Known-misspelling corrections: exact-literal typo substitutions (no fuzzy matching). Not added to geographic-directory.ts, which is generated and would lose the edit.
 * "Huston" -> "Houston": "huston" is not a registered city/county; unresolved it fell back to the bare-state 100-row listing. */
export const healthcareMisspellingRewrites: readonly LexicalRewriteRule[] = [
  { pattern: "huston", replacement: "houston" },
  // Batch 4: misspellings of "hospitals" seen in the 600-query catalog; left to the LLM they were clarified about half the time.
  { pattern: "hosptials", replacement: "hospitals" },
  { pattern: "hospitls", replacement: "hospitals" },
  // 2,000 sweep (Batch C): typos the deterministic path answered wrongly or not at all ("Compare stroke mortalty in New York
  // and New Jersey" returned a patient-experience ranking). Not words in any hospital, city or county name.
  { pattern: "mortalty", replacement: "mortality" },
  { pattern: "storke", replacement: "stroke" },
  { pattern: "lowst", replacement: "lowest" },
  { pattern: "ratting", replacement: "rating" },
  // Batch D: "What are the hospitals in Gaum?" was asked "Did you mean Georgia (GA)?".
  { pattern: "gaum", replacement: "guam" },
  // Batch E: "hospitals in Florda for hart failur" was refused.
  { pattern: "florda", replacement: "florida" },
];
