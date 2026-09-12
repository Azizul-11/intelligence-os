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

  // Tier0 Task 4 (F1): "average" is a generic fallback for the more
  // specific "national average" alias (see national-average.ts) - a
  // word inserted between "national" and "average" (e.g. "national
  // mortality average") breaks that 2-word alias silently, leaving
  // only this bare one to match. See AliasDefinition.genericFallbackOf.
  genericFallbackOf: "national-average",
};
