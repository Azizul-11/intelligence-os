import type { BenchmarkDefinition } from "@intelligence/domain-sdk";

export const hospitalStarRatingBenchmark: BenchmarkDefinition = {
  id: "hospital-star-rating",

  metricId: "hospital-overall-rating",

  displayName: "Hospital Star Rating",

  description:
    "CMS Hospital Overall Star Rating benchmark used to evaluate overall hospital quality.",

  benchmarkType: "industry",

  classification: "good",

  minimumValue: 1,

  maximumValue: 5,

  higherIsBetter: true,

  enabled: true,
} as const;