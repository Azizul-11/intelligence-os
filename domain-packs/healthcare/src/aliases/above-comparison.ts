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
    // Batch 3: performance wordings ("performing above the national average", "beat") need aliases or the question fell to the LLM (D084-D088).
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
