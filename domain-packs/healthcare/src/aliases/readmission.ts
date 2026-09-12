import type { AliasDefinition } from "@intelligence/domain-sdk";

export const readmissionAlias: AliasDefinition = {
  id: "readmission",

  canonical: "readmission-rate",

  aliases: [
    "Readmission",
    "Readmission Rate",
    "30-Day Readmission",
    // Tier1 Task 1: plural forms - AliasResolver is exact-match only
    // (see packages/semantic/src/alias/alias-resolver.ts), so a plural
    // mention resolves only if explicitly registered here.
    "Readmissions",
    "Readmission Rates",
  ],

  type: "metric",

  description:
    "Hospital readmission quality metric.",
};