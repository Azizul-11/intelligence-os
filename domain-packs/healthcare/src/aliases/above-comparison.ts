import type { AliasDefinition } from "@intelligence/domain-sdk";

export const aboveComparisonAliases: AliasDefinition = {
  id: "above-comparison-aliases",

  canonical: "above-comparison",

  aliases: [
    "above",
    "above the",
    "higher than",
    "greater than",
    "exceeding",
    "over",
    "outperform",
    // Batch 3: performance wordings of the same comparison. "performing above the national average" used to leave
    // "performing" unaccounted, so the question went to the LLM front door, which dropped the benchmark and answered a
    // plain ranking (D084, D085, D087); "beat" had no alias at all (D088).
    "performing above",
    "performing above the",
    "beat",
    "beats",
    "beating",
    "better than",
  ],

  type: "relationship",

  description:
    "Comparison operator for values above a benchmark.",
};
