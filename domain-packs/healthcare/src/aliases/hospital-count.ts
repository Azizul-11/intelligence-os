import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalCountAlias: AliasDefinition = {
  id: "hospital-count",

  canonical: "hospital-count",

  aliases: [
    "hospital count",
    "number of hospitals",
    "how many hospitals",
    "count hospitals",
    "total hospitals",
  ],

  type: "metric",

  description:
    "Aliases for hospital count metric.",
};
