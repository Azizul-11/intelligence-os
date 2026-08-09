import type { AliasDefinition } from "@intelligence/domain-sdk";

export const nationalAverageAliases: AliasDefinition = {
  id: "national-average-aliases",

  canonical: "national-average",

  aliases: [
    "national average",
    "nationwide average",
    "us average",
    "country average",
  ],

  type: "benchmark",

  description:
    "National average benchmark for comparison.",
};
