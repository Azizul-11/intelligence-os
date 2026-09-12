import type { AliasDefinition } from "@intelligence/domain-sdk";

export const mortalityRateAlias: AliasDefinition = {
  id: "mortality-rate",

  canonical: "mortality-rate",

  aliases: [
    "mortality",
    "mortality rate",
    "death rate",
    "hospital mortality",
    // Tier1 Task 1: plural forms - AliasResolver is exact-match only
    // (see packages/semantic/src/alias/alias-resolver.ts), so a plural
    // mention resolves only if explicitly registered here.
    "mortalities",
    "mortality rates",
  ],

  type: "metric",

  description:
    "Aliases for mortality rate.",
};