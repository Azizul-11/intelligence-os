import type { AliasDefinition } from "@intelligence/domain-sdk";

export const safetyPerformanceAlias: AliasDefinition = {
  id: "safety-performance",

  canonical: "safety-performance",

  aliases: [
    "safety performance",
    "safety outcomes",
    "better safety outcomes",
    "safety measures",
    "hospital safety",
    "safety rating",
    "safety score",
    "safety record",
    "safety track record",
    // Tier1 Task 1: plural/singular gaps - AliasResolver is exact-match
    // only (see packages/semantic/src/alias/alias-resolver.ts). This
    // array was inconsistent in both directions: "safety outcomes"
    // (plural) was already registered but not "safety outcome"
    // (singular); "safety score" (singular) was registered but not
    // "safety scores" (plural). Both gaps closed here, whichever
    // direction was actually missing - not assumed to always be plural.
    "safety outcome",
    "safety scores",
  ],

  type: "metric",

  description:
    "Aliases for safety performance metric.",
};
