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
};
