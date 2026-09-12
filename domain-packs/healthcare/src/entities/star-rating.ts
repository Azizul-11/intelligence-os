import type { EntityDefinition } from "@intelligence/domain-sdk";
import { ratingCategory } from "./entity-categories";

export const starRatingEntity: EntityDefinition = {
  id: "star-rating",

  name: "star-rating",

  displayName: "Star Rating",

  category: ratingCategory,

  description:
    "CMS hospital overall star-rating value (1-5) used for filtering.",

  execution: {
    parameter: "overallRating",
  },
} as const;
