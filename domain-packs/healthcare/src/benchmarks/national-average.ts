import type { BenchmarkDefinition } from "@intelligence/domain-sdk";

export const nationalAverageBenchmark: BenchmarkDefinition = {
  id: "national-average",

  metricId: "hospital-overall-rating",

  displayName: "National Average",

  description:
    "Compares healthcare metrics against the national average benchmark.",

  benchmarkType: "national",

  classification: "average",

  higherIsBetter: true,

  enabled: true,
} as const;