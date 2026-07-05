import type { RecommendationDefinition } from "@intelligence/domain-sdk";

export const compareWithPeersRecommendation: RecommendationDefinition = {
  id: "compare-with-peers",

  name: "compare-with-peers",

  displayName: "Compare with Peers",

  description:
    "Compare this hospital with similar healthcare organizations.",

  priority: "medium",

  capabilityId: "compare-hospitals",

  enabled: true,
};