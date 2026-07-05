import type { RecommendationDefinition } from "@intelligence/domain-sdk";

export const reviewReadmissionRecommendation: RecommendationDefinition = {
  id: "review-readmission",

  name: "review-readmission",

  displayName: "Review Readmission",

  description:
    "Review readmission performance against healthcare benchmarks.",

  priority: "high",

  capabilityId: "benchmark-analysis",

  enabled: true,
};