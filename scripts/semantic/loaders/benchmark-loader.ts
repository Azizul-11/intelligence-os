import type {
  BenchmarkDefinition as DomainBenchmarkDefinition,
} from "@intelligence/domain-sdk";

import type {
  BenchmarkDefinition as SemanticBenchmarkDefinition,
} from "@intelligence/contracts/semantic";

/**
 * Converts Domain SDK benchmarks into canonical Semantic benchmarks.
 */
export function loadBenchmarks(
  benchmarks: readonly DomainBenchmarkDefinition[],
  domain: string,
): SemanticBenchmarkDefinition[] {
  return benchmarks.map((benchmark) => {
    if (!benchmark.id) {
      throw new Error("Benchmark id is required.");
    }

    if (!benchmark.displayName) {
      throw new Error(
        `Benchmark "${benchmark.id}" is missing a display name.`,
      );
    }

    return {
      key: benchmark.id,

      metricKey: benchmark.metricId,

      displayName: benchmark.displayName,

      description: benchmark.description ?? "",

      benchmarkType: benchmark.benchmarkType,

      value: benchmark.maximumValue,

      domain,

      enabled: benchmark.enabled ?? true,
    };
  });
}