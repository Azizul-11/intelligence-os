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
  // Bug G (Phase 3.3, 2026-09-18): "strongest" is just another synonym
  // for this exact same idiom (RANKING_KEYWORDS now recognizes it as a
  // ranking word too - see query-intent-detector.ts - but that alone
  // only sets intent, not which metric to rank by). Without this rule,
  // a bare "strongest hospitals" with no OTHER metric phrase present
  // (e.g. "give me the strongest hospitals in California") has no
  // rankable metric candidate at all: "hospitals in" alone resolves to
  // the non-rankable "hospital-list" listing metric, which has no
  // "-ranking" template. Deliberately NOT registering singular/plural
  // "strong hospital(s)" here: unlike "strongest", "strong" collides
  // with a real hospital name ("STRONG MEMORIAL HOSPITAL" - see
  // query-intent-detector.ts's own comment) and was already excluded
  // from RANKING_KEYWORDS for that reason; registering it here too
  // would silently rewrite any query naming that hospital.
  { pattern: "strongest hospitals", replacement: "hospital overall rating" },
  { pattern: "strongest hospital", replacement: "hospital overall rating" },
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
  // 2,000 sweep (Batch B): "do tribal hospitals have ratings" names the overall rating with no measure word; it reached the
  // model, whose answer ("ratings" unsupported vs a rewrite) flipped with the ownership words added to the prompt.
  { pattern: "have ratings", replacement: "have hospital overall rating" },
  // 2,000 sweep (Batch C): "Is Mayo Clinic good on overall mortality?" is the hospital-wide rate (a named hospital skips the
  // front door, so no phrase group sees it); direction-free, so the words around it keep their meaning.
  { pattern: "overall mortality", replacement: "hospital wide mortality" },
  // Batch 4: ranking phrasings that name no metric ("hospitals ranked by
  // state", "which hospital comes out on top") and "for each <unit>" as a
  // grouping. Same idiom, same fallback metric as above: an explicitly named
  // metric still wins. Deliberately no "hospitals lead ...": "lead" cannot be
  // a ranking word (a real hospital is named "MONUMENT HEALTH LEAD-DEADWOOD").
  { pattern: "hospitals ranked", replacement: "hospital overall rating" },
  { pattern: "hospital comes out on top", replacement: "hospital overall rating" },
  { pattern: "best experience", replacement: "patient experience" },
  { pattern: "for each state", replacement: "by state" },
  { pattern: "for each county", replacement: "by county" },
  // 2,000 sweep (Batch D): more grouping wordings (and "break down the best hospitals" at the top). Each left a word
  // unresolved ("break down", "view"), so the question went to the model, which dropped the grouping.
  { pattern: "state by state view", replacement: "by state" },
  { pattern: "state by state", replacement: "by state" },
  // Batch 5B-4: the emergency-services flag is written after "hospitals" ("hospitals with emergency services in Ohio",
  // "hospitals in Texas that provide emergency services"); the ownership-word position ("emergency services hospitals
  // in Ohio") is the shape the planner answers, exactly like "non-profit hospitals in Ohio".
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

/**
 * Known-misspelling corrections (Phase 3.4/3.5, 2026-09-18): a small,
 * separate category from the ranking-idiom rules above - not an idiom,
 * a literal exact-match typo-to-correct-spelling substitution, same
 * "no fuzzy matching, exact literal string" convention this whole
 * campaign has used everywhere else (e.g. ownership-directory.ts's
 * "goverment"/"govt"/"gov" -> "government" entries). Deliberately NOT
 * added directly to geographic-directory.ts's own CITIES/COUNTIES maps:
 * that file is machine-generated ("Generated deterministically from...
 * scripts/generate-geographic-directory.ts. Not hand-maintained;
 * regenerate from that script if source data changes." - its own doc
 * comment) - a hand-edit there would be silently wiped out by the next
 * regeneration. This rewrite layer runs before phrase extraction/alias
 * resolution ever sees the generated directory, so it survives any
 * future regeneration untouched.
 *
 * "Huston" -> "Houston": confirmed via direct grep that "huston" is not
 * itself a registered city/county anywhere in geographic-directory.ts -
 * it is only ever the common one-letter-dropped misspelling of
 * "Houston" (a real city in AL/GA/TN/TX per the COUNTIES map, and
 * MO/MS/TX per the CITIES map). "show me hospital in Huston, Texas"
 * previously left "Huston" entirely unresolved (no city/county
 * candidate at all), silently falling back to the bare-state 100-row
 * listing instead of the 28-row Houston, TX result.
 */
export const healthcareMisspellingRewrites: readonly LexicalRewriteRule[] = [
  { pattern: "huston", replacement: "houston" },
  // Batch 4: the two misspellings of the domain's own core word that the
  // 600-query catalog actually contains ("best hosptials", "show 5 star
  // hospitls"). Left to the LLM front door they were clarified about half the
  // time ("Which metric should I rank by?"): a coin flip on a question the
  // deterministic layers answer once the word is spelled right.
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
