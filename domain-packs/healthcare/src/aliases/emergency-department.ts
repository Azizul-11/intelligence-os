import type { AliasDefinition } from "@intelligence/domain-sdk";

export const emergencyDepartmentAlias: AliasDefinition = {
  id: "emergency-department",

  canonical: "Emergency Department",

  aliases: [
    "ED",
    "Emergency Department",
    "Emergency Room",
    "ER",
  ],

  type: "entity",

  description:
    "Canonical healthcare term for emergency care facilities.",
};