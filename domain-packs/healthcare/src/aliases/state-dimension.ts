import type { AliasDefinition } from "@intelligence/domain-sdk";

export const stateDimensionAliases: AliasDefinition = {
  id: "state-dimension-aliases",

  canonical: "state-dimension",

  aliases: [
    "by state",
    "per state",
    "state breakdown",
    "each state",
    // Batch 3: "For every state, show me the highest-rated hospital" (D056) - the same grouping, another wording.
    "every state",
    "for every state",
    "in every state",
  ],

  type: "dimension",

  description:
    "State dimension for geographic breakdown.",
};
