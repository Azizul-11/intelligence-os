import type { AliasDefinition } from "@intelligence/domain-sdk";

export const stateAverageAliases: AliasDefinition = {
  id: "state-average-aliases",

  canonical: "state-average",

  aliases: [
    "state average",
    "regional average",
  ],

  type: "benchmark",

  description:
    "State/regional average benchmark for comparison.",
};
