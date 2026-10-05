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

    // Tier0 Task 4 F1 V2: metric words inserted in "national average" are registered as literal contiguous aliases (PhraseExtractor matches only contiguous text);
    // unregistered gap words stay caught by average.ts genericFallbackOf (detectSubsumedBenchmarkRisk).
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
