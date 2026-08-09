import type { AliasDefinition } from "@intelligence/domain-sdk";

export const stateDimensionAliases: AliasDefinition = {
  id: "state-dimension-aliases",

  canonical: "state-dimension",

  aliases: [
    "by state",
    "per state",
    "state breakdown",
    "each state",
  ],

  type: "dimension",

  description:
    "State dimension for geographic breakdown.",
};
