import type { AliasDefinition } from "@intelligence/domain-sdk";

export const readmissionAlias: AliasDefinition = {
  id: "readmission",

  canonical: "readmission-rate",

  aliases: [
    "Readmission",
    "Readmission Rate",
    "30-Day Readmission",
    // Tier1 Task 1: plural forms; AliasResolver is exact-match only (packages/semantic/src/alias/alias-resolver.ts).
    "Readmissions",
    "Readmission Rates",
  ],

  type: "metric",

  description:
    "Hospital readmission quality metric.",
};