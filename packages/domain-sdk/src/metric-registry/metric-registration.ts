/** A metric definition plus its enabled flag, as tracked by MetricRegistry. */
import type { MetricDefinition } from "./metric-definition";

export interface MetricRegistration {
  metric: MetricDefinition;

  enabled: boolean;
}