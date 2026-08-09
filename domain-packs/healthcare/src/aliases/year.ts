import type { AliasDefinition } from "@intelligence/domain-sdk";

export const yearAliases: AliasDefinition = {
  id: "year-aliases",

  canonical: "year-dimension",

  aliases: [
    "year",
    "yearly",
    "by year",
    "per year",
    "annually",
  ],

  type: "dimension",

  description:
    "Year dimension for temporal breakdown.",
};
