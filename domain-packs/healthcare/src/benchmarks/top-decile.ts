import type { BenchmarkDefinition } from "@intelligence/domain-sdk";

export const topDecileBenchmark: BenchmarkDefinition = {
  id: "top-decile",

  metricId: "hospital-overall-rating",

  displayName: "Top Decile",

  description:
    "Represents the top-performing healthcare organizations within a peer group.",

  benchmarkType: "peer",

  classification: "excellent",

  higherIsBetter: true,

  enabled: true,
} as const;