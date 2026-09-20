import type { AliasDefinition } from "@intelligence/domain-sdk";

export const nationalAverageAliases: AliasDefinition = {
  id: "national-average-aliases",

  canonical: "national-average",

  aliases: [
    "national average",
    "nationwide average",
    "us average",
    "country average",
    // Batch 3: "the national benchmark for overall rating" (D089) - the same reference value, another word for it.
    "national benchmark",

    // Tier0 Task 4 F1 Real Fix V2 (Option A+): known metric words
    // commonly inserted between "national"/"nationwide"/"us" and
    // "average" ("national mortality average" - meaning "the national
    // average, for mortality") are registered here as their own
    // literal, contiguous aliases - the same pattern already used for
    // "nationwide average"/"us average"/"country average" above, not a
    // new mechanism. PhraseExtractor still only matches contiguous
    // text; these are simply additional contiguous phrases a user
    // commonly types. An unregistered gap word (e.g. "national xyz
    // average") still has no literal alias to match here and remains
    // caught by average.ts's genericFallbackOf safety net
    // (detectSubsumedBenchmarkRisk), unaffected by this change.
    "national mortality average",
    "national readmission average",
    "national mortality rate average",
    "national readmission rate average",
    "national death rate average",
    "nationwide mortality average",
    "nationwide readmission average",
    "us mortality average",
    "us readmission average",
  ],

  type: "benchmark",

  description:
    "National average benchmark for comparison.",
};
