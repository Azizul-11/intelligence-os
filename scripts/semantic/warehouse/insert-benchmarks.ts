import type {
  BenchmarkDefinition,
} from "@intelligence/contracts/semantic";

import { supabase } from "../../shared/supabase";

function mapBenchmark(benchmark: BenchmarkDefinition) {
  return {
    benchmark_key: benchmark.key,

    display_name: benchmark.displayName,

    description: benchmark.description,
  };
}

export async function insertBenchmarks(
  benchmarks: readonly BenchmarkDefinition[],
) {
  const rows = benchmarks.map(mapBenchmark);

  const { error } = await supabase
    .from("benchmark_registry")
    .upsert(rows, {
      onConflict: "benchmark_key",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}