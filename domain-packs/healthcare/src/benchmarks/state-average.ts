import type { BenchmarkDefinition } from "@intelligence/domain-sdk";

export const stateAverageBenchmark: BenchmarkDefinition = {
  id: "state-average",

  metricId: "hospital-overall-rating",

  displayName: "State Average",

  description:
    "Compares healthcare metrics against the state average benchmark.",

  benchmarkType: "state",

  classification: "average",

  higherIsBetter: true,

  enabled: true,
} as const;