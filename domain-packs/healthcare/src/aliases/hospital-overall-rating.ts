import type { AliasDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingAlias: AliasDefinition = {
  id: "hospital-overall-rating",

 canonical: "hospital-overall-rating",

  aliases: [
    "Hospital Overall Rating",
    "Overall Rating",
    "Star Rating",
    "Overall Hospital Rating",
    "Overall Hospital Ratings",
    "Hospital Ratings",
    "Overall Ratings",
  ],

  type: "metric",

  description:
    "Overall CMS hospital quality rating.",
};