import type { AliasDefinition } from "@intelligence/domain-sdk";

export const readmissionAlias: AliasDefinition = {
  id: "readmission",

  canonical: "readmission-rate",

  aliases: [
    "Readmission",
    "Readmission Rate",
    "30-Day Readmission",
  ],

  type: "metric",

  description:
    "Hospital readmission quality metric.",
};