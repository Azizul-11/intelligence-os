export class HealthcareTemplateSelector {
  select(
    metricId: string,
    intent: string,
  ): string {
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