export class HealthcareTemplateSelector {
  select(
    metricId: string,
    intent: string,
  ): string {
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