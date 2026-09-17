import type { AliasDefinition } from "@intelligence/domain-sdk";

export const safetyPerformanceAlias: AliasDefinition = {
  id: "safety-performance",

  canonical: "safety-performance",

  aliases: [
    "safety performance",
    "safety outcomes",
    "better safety outcomes",
    "safety measures",
    "hospital safety",
    "safety rating",
    "safety score",
    "safety record",
    "safety track record",
    // Tier1 Task 1: plural/singular gaps - AliasResolver is exact-match
    // only (see packages/semantic/src/alias/alias-resolver.ts). This
    // array was inconsistent in both directions: "safety outcomes"
    // (plural) was already registered but not "safety outcome"
    // (singular); "safety score" (singular) was registered but not
    // "safety scores" (plural). Both gaps closed here, whichever
    // direction was actually missing - not assumed to always be plural.
    "safety outcome",
    "safety scores",
    // Bug L Part B (2026-09-15): bare "safety" alone only ever matched
    // the separate, inert CATEGORY alias (aliases/safety.ts, canonical
    // "safety" - never a rankable metric, the pre-existing F13 gap) -
    // confirmed live via a semantic-candidate trace that "good safety"/
    // "good saftey" resolved zero metric candidates, so the request had
    // no metric to plan against ("Unable to create query plan.")
    // regardless of how well the LLM gateway's prompt already covers
    // this phrasing (Layer 1 is only ever a rewrite of last resort - it
    // cannot fix a request that already produced a wrong-but-nonzero
    // resolution). These specific adjective+"safety" phrases are
    // registered as their own literal, exact-match aliases (the same
    // convention Tier1 T1 used for plural/singular gaps) so the metric
    // resolves deterministically, with zero dependency on the LLM.
    // Deliberately excludes "best safety"/"highest safety"/etc: verified
    // live that LexicalRewriter strips recognized MODIFIER words
    // (lexicon.ts's "best"/"highest"/"lowest"/"worst"/"top"/etc.) BEFORE
    // PhraseExtractor generates candidate phrases (semantic-pipeline.ts's
    // own comment: "LexicalRewriter strips modifier words before phrase
    // extraction runs"), so a modifier+"safety" combination can never
    // survive as a 2-word alias match - only bare "safety" would remain,
    // reopening the exact F13 collision risk this fix avoids elsewhere.
    // "good"/"great"/"excellent" are plain nouns/adjectives, not
    // registered MODIFIERS, so they survive and this works for them.
    "good safety",
    "good saftey",
    "great safety",
    "excellent safety",
    // Bug F (Phase 3.3, 2026-09-18): the bare superlative "safest" never
    // resolved to any metric - confirmed via a semantic-candidate trace
    // that it produced zero alias matches, leaving only the separate,
    // non-rankable "hospital-list" metric ("hospitals in") as the sole
    // candidate, so "safest hospitals in Texas" silently returned an
    // unranked list ordered by nothing in particular instead of ranking
    // by this metric. "safest" is not a registered MODIFIER (see
    // packages/semantic/src/analyzer/lexicon.ts), so - unlike "best"/
    // "highest"/etc. - it is never stripped before phrase extraction and
    // survives as its own literal phrase candidate, making a plain
    // alias entry (this campaign's standard mechanism) sufficient with
    // no LexicalRewriter/idiom-rule change needed. Deliberately does NOT
    // also add bare "safety" here (suggested "for symmetry" in the
    // Round 6 audit's own fix plan): bare "safety" is the pre-existing,
    // deliberate F13 category/metric collision gap (see this file's own
    // "good safety" comment above) - reopening it was never actually
    // required to fix this bug and would reintroduce a cross-metric
    // ambiguity this campaign has avoided everywhere else.
    "safest",
  ],

  type: "metric",

  description:
    "Aliases for safety performance metric.",
};
