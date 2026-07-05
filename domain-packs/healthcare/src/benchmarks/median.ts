import type { BenchmarkDefinition } from "@intelligence/domain-sdk";

export const medianBenchmark: BenchmarkDefinition = {
  id: "median",

  metricId: "length-of-stay",

  displayName: "Median",

  description:
    "Represents the statistical midpoint used for healthcare metric comparisons.",

  benchmarkType: "historical",

  classification: "average",

  higherIsBetter: false,

  enabled: true,
} as const;