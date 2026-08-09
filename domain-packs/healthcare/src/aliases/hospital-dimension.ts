import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalDimensionAliases: AliasDefinition = {
  id: "hospital-dimension-aliases",

  canonical: "hospital-dimension",

  aliases: [
    "by hospital",
    "per hospital",
    "hospital breakdown",
    "each hospital",
  ],

  type: "dimension",

  description:
    "Hospital dimension for facility-level breakdown.",
};
