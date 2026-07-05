import type { CapabilityDefinition } from "@intelligence/domain-sdk";

export const countyComparisonCapability: CapabilityDefinition = {
  id: "county-comparison",

  name: "county-comparison",

  displayName: "County Comparison",

  description:
    "Compare hospitals and healthcare metrics across counties.",

  category: "comparison",

  enabled: true,
};