import type { RecommendationDefinition } from "@intelligence/domain-sdk";

export const analyzePatientExperienceRecommendation: RecommendationDefinition = {
  id: "analyze-patient-experience",

  name: "analyze-patient-experience",

  displayName: "Analyze Patient Experience",

  description:
    "Analyze patient experience trends across healthcare organizations.",

  priority: "medium",

  capabilityId: "trend-analysis",

  enabled: true,
};