import type { RecommendationDefinition } from "@intelligence/domain-sdk";

export const investigateLengthOfStayRecommendation: RecommendationDefinition = {
  id: "investigate-length-of-stay",

  name: "investigate-length-of-stay",

  displayName: "Investigate Length of Stay",

  description:
    "Review length of stay trends and identify optimization opportunities.",

  priority: "medium",

  capabilityId: "trend-analysis",

  enabled: true,
};