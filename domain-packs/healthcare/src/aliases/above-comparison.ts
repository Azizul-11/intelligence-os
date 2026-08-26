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
  ],

  type: "relationship",

  description:
    "Comparison operator for values above a benchmark.",
};
