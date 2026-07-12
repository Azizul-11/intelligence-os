import type {
  MetricDefinition,
} from "@intelligence/contracts/semantic";

import { supabase } from "../../shared/supabase";

function mapMetric(metric: MetricDefinition) {
  return {
    metric_key: metric.key,

    display_name: metric.displayName,

    description: metric.description,

    unit: metric.unit,

    data_type: metric.dataType,

    aggregation: metric.aggregation,

    rankable: metric.rankable,

    benchmark_supported: metric.benchmarkSupported,
  };
}

export async function insertMetrics(
  metrics: readonly MetricDefinition[],
) {
  const rows = metrics.map(mapMetric);

  const { error } = await supabase
    .from("metric_registry")
    .upsert(rows, {
      onConflict: "metric_key",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}