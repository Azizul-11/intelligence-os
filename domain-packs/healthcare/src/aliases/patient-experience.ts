import type { AliasDefinition } from "@intelligence/domain-sdk";

export const patientExperienceAlias: AliasDefinition = {
  id: "patient-experience",

  canonical: "patient-experience",

  aliases: [
    "patient experience",
    "patient satisfaction",
    "patient survey",
    "survey results",
    "experience score",
  ],

  type: "metric",

  description:
    "Aliases for the patient experience metric.",
};