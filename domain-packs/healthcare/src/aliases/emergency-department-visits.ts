import type { AliasDefinition } from "@intelligence/domain-sdk";

export const emergencyDepartmentVisitsAlias: AliasDefinition = {
  id: "emergency-department-visits",

  canonical: "emergency-department-visits",

  aliases: [
    "emergency department visits",
    "ed visits",
    "er visits",
    "emergency room visits",
    "emergency utilization",
  ],

  type: "metric",

  description:
    "Aliases for emergency department visits.",
};