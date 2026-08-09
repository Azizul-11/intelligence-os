import type { DimensionDefinition } from "@intelligence/domain-sdk";

export const hospitalDimension: DimensionDefinition = {
  id: "hospital-dimension",

  name: "hospital",

  displayName: "Hospital",

  description:
    "Healthcare facility.",

  hierarchyLevel: 3,
};