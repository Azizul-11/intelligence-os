import type { AliasDefinition } from "@intelligence/domain-sdk";

export const countyAliases: AliasDefinition = {
  id: "county-aliases",

  canonical: "county-dimension",

  aliases: [
    "county",
    "counties",
    "by county",
    "per county",
    "county breakdown",
  ],

  type: "dimension",

  description:
    "County dimension for geographic breakdown.",
};
