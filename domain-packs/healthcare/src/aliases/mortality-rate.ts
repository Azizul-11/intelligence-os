import type { AliasDefinition } from "@intelligence/domain-sdk";

export const mortalityRateAlias: AliasDefinition = {
  id: "mortality-rate",

  canonical: "mortality-rate",

  aliases: [
    "mortality",
    "mortality rate",
    "death rate",
    "hospital mortality",
  ],

  type: "metric",

  description:
    "Aliases for mortality rate.",
};