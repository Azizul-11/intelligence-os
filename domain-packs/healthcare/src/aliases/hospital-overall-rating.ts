import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingAlias: AliasDefinition = {
  id: "hospital-overall-rating",

 canonical: "hospital-overall-rating",

  aliases: [
    "Hospital Overall Rating",
    "Overall Rating",
    "Star Rating",
  ],

  type: "metric",

  description:
    "Overall CMS hospital quality rating.",
};