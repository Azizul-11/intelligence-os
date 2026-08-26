/**
 * RCG-008: maps a dimension's opaque canonical key (as carried on
 * ExecutionPlan.grouping.dimensions, unchanged Universal shape) to the
 * SQL template-id suffix for the grouped template Healthcare has
 * authored for it. Dimensions with no entry here (e.g. "year-dimension"
 * - no backing warehouse column; "hospital-dimension" - grouping by row
 * identity is degenerate) are deliberately unsupported; see
 * HealthcareExecutionStrategy.selectTemplateFromPlan().
 */
const GROUPED_DIMENSION_TEMPLATE_SUFFIX: Record<string, string> = {
  "state-dimension": "state",
  "county-dimension": "county",
};

export class HealthcareTemplateSelector {
  select(
    metricId: string,
    intent: string,
    dimensionKey?: string,
  ): string {
    if (intent === "ranking-by-dimension") {
      const suffix = dimensionKey
        ? GROUPED_DIMENSION_TEMPLATE_SUFFIX[dimensionKey]
        : undefined;

      // No registered grouped template for this dimension - deliberately
      // resolve to an id with no matching template, so this fails
      // honestly ("SQL template not found") instead of silently falling
      // through to the plain, ungrouped ranking template (the exact
      // RCG-008 silent-no-op defect this cycle fixes).
      return suffix
        ? `${metricId}-ranking-by-${suffix}`
        : `${metricId}-ranking-by-dimension-unsupported`;
    }

    if (intent === "ranking-benchmark") {
      return `${metricId}-ranking-benchmark`;
    }

    // Explicit template mappings for metrics with non-standard template IDs
    if (metricId === "hospital-count" && intent === "aggregation") {
      return "hospital-count-by-state";
    }

    if (metricId === "hospital-list" && intent === "lookup") {
      return "hospital-list-by-state";
    }

    // Standard intent-based template selection
    switch (intent) {
      case "ranking":
        return `${metricId}-ranking`;

      case "lookup":
        return metricId;

      case "comparison":
        return `${metricId}-comparison`;

      case "trend":
        return `${metricId}-trend`;

      case "aggregation":
        return `${metricId}-aggregation`;

      // Phase 7: fetch this metric's values for an exact, already-
      // determined set of facility_ids (secondary metric enrichment).
      case "byIds":
        return `${metricId}-by-facility-ids`;

      default:
        return metricId;
    }
  }
}