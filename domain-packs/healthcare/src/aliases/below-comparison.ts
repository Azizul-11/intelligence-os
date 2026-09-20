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
    // Batch 3: performance wording of the same comparison (see above-comparison.ts).
    "performing below",
    "performing below the",
  ],

  type: "relationship",

  description:
    "Comparison operator for values below a benchmark.",
};
