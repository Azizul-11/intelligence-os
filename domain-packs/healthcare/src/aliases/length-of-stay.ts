import type { AliasDefinition } from "@intelligence/domain-sdk";

export const lengthOfStayAlias: AliasDefinition = {
  id: "length-of-stay",

  canonical: "length-of-stay",

  aliases: [
    "length of stay",
    "average stay",
    "average length of stay",
    "hospital stay",
    "los",
  ],

  type: "metric",

  description:
    "Aliases for hospital length of stay.",
};