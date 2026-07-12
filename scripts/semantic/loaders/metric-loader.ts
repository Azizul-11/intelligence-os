import type {
  MetricDefinition as DomainMetricDefinition,
} from "@intelligence/domain-sdk";

import type {
  MetricDefinition as SemanticMetricDefinition,
} from "@intelligence/contracts/semantic";

/**
 * Converts Domain SDK metrics into canonical Semantic metrics.
 */
export function loadMetrics(
  metrics: readonly DomainMetricDefinition[],
  domain: string,
): SemanticMetricDefinition[] {
  return metrics.map((metric) => {
    if (!metric.id) {
      throw new Error("Metric id is required.");
    }

    if (!metric.displayName) {
      throw new Error(
        `Metric "${metric.id}" is missing a display name.`,
      );
    }

    return {
      key: metric.id,

      displayName: metric.displayName,

      description: metric.description ?? "",

      category: metric.category?.id ?? "general",

      unit: metric.unit ?? "unknown",

      aggregation: metric.aggregatable ? "aggregate" : "none",

      dataType: "number",

      rankable: metric.rankable ?? false,

      benchmarkSupported: metric.benchmarkable ?? false,

      domain,

      enabled: true,
    };
  });
}