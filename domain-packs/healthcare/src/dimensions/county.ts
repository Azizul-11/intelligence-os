import type { DimensionDefinition } from "@intelligence/domain-sdk";

export const countyDimension: DimensionDefinition = {
  id: "county-dimension",

  name: "county",

  displayName: "County",

  description:
    "County within a state.",

  hierarchyLevel: 2,
};