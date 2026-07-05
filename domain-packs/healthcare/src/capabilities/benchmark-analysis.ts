import type { CapabilityDefinition } from "@intelligence/domain-sdk";

export const benchmarkAnalysisCapability: CapabilityDefinition = {
  id: "benchmark-analysis",

  name: "benchmark-analysis",

  displayName: "Benchmark Analysis",

  description:
    "Compare healthcare metrics against registered benchmark definitions.",

  category: "benchmarking",

  enabled: true,
};