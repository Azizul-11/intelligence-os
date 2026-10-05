import type { AliasDefinition } from "@intelligence/domain-sdk";

export const averageAliases: AliasDefinition = {
  id: "average-aliases",

  canonical: "median",

  aliases: [
    "average",
    "mean",
    "typical",
  ],

  type: "benchmark",

  description:
    "Average/median benchmark for comparison.",

  // Tier0 Task 4 (F1): generic fallback for "national average"; a word between them (e.g. "national mortality average") breaks the 2-word alias.
  // See AliasDefinition.genericFallbackOf.
  genericFallbackOf: "national-average",
};
