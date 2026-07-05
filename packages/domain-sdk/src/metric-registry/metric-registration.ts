import type { MetricDefinition } from "./metric-definition";

export interface MetricRegistration {
  metric: MetricDefinition;

  enabled: boolean;
}