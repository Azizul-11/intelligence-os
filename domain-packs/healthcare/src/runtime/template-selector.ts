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

      default:
        return metricId;
    }
  }
}