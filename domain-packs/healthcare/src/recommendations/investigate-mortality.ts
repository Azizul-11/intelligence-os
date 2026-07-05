import type { RecommendationDefinition } from "@intelligence/domain-sdk";

export const investigateMortalityRecommendation: RecommendationDefinition = {
  id: "investigate-mortality",

  name: "investigate-mortality",

  displayName: "Investigate Mortality",

  description:
    "Review mortality trends and identify potential contributing factors.",

  priority: "high",

  capabilityId: "benchmark-analysis",

  enabled: true,
};