import type { AliasDefinition } from "@intelligence/domain-sdk";

// Batch 5B-1: concept-identifying words only; "mortality" stays the separate metric alias, and a compound alias spelling it out would consume the
// metric span and break the two-part resolution.
export const hospitalWideMortalityAlias: AliasDefinition = {
  id: "hospital-wide-mortality",

  canonical: "hospital-wide-mortality",

  aliases: [
    "hospital wide",
    "hospital-wide",
    "all cause",
    "all-cause",
  ],

  type: "concept",

  description:
    "Canonical healthcare term representing hospital-wide, all-cause mortality.",
};
