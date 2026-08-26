import type { AliasDefinition } from "@intelligence/domain-sdk";

export const belowComparisonAliases: AliasDefinition = {
  id: "below-comparison-aliases",

  canonical: "below-comparison",

  aliases: [
    "below",
    "below the",
    "lower than",
    "less than",
    "under",
    "beneath",
    "worse than",
  ],

  type: "relationship",

  description:
    "Comparison operator for values below a benchmark.",
};
