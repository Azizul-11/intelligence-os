import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingAlias: AliasDefinition = {
  id: "hospital-overall-rating",

  canonical: "Hospital Overall Rating",

  aliases: [
    "Hospital Overall Rating",
    "Overall Rating",
    "Star Rating",
  ],

  type: "metric",

  description:
    "Overall CMS hospital quality rating.",
};