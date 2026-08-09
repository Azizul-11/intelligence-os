import type { DimensionDefinition } from "@intelligence/domain-sdk";

export const yearDimension: DimensionDefinition = {
  id: "year-dimension",

  name: "year",

  displayName: "Year",

  description:
    "Reporting or measurement year.",

  hierarchyLevel: 4,
};