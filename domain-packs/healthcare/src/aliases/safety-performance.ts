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
    // Tier1 Task 1: plural/singular gaps in both directions ("safety outcome", "safety scores"); AliasResolver is exact-match only.
    "safety outcome",
    "safety scores",
    // Bug L Part B: bare "safety" matched only the inert CATEGORY alias (F13), so "good safety" had no metric; adjective+"safety" literals fix it without the LLM.
    // "best/highest safety" are excluded: LexicalRewriter strips modifier words before phrase extraction, leaving bare "safety" (F13 collision).
    "good safety",
    "good saftey",
    "great safety",
    "excellent safety",
    // Bug F (Phase 3.3): bare "safest" resolved no metric; it is not a MODIFIER (lexicon.ts) so a plain alias survives phrase extraction.
    // Bare "safety" is deliberately NOT added: it is the F13 category/metric collision gap and would add cross-metric ambiguity.
    "safest",
  ],

  type: "metric",

  description:
    "Aliases for safety performance metric.",
};
