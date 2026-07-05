import type { CapabilityDefinition } from "@intelligence/domain-sdk";

export const trendAnalysisCapability: CapabilityDefinition = {
  id: "trend-analysis",

  name: "trend-analysis",

  displayName: "Trend Analysis",

  description:
    "Analyze healthcare performance trends across time.",

  category: "analytics",

  enabled: true,
};