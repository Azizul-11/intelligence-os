import type { AliasDefinition } from "@intelligence/domain-sdk";

// Batch 5B-1: the concept-identifying words only - "mortality" itself is already the bare metric alias in
// mortality-rate.ts, so "hospital wide mortality" resolves as concept=hospital-wide-mortality + metric=mortality-rate
// together (the same two-part pattern as every other condition concept, e.g. aliases/stroke.ts). A compound alias
// that spells out "mortality" itself was deliberately avoided: it would consume the metric word as part of the
// concept match, leaving no separate metric span for the two-part resolution to find.
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
