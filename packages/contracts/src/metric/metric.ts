import type { MetricDefinition } from "./metric-definition";
import type { MetricValue } from "./metric-value";

/**
 * Represents a metric instance within the platform.
 */
export interface Metric {
  /**
   * Metric definition.
   */
  definition: MetricDefinition;

  /**
   * Measured value.
   */
  value: MetricValue;
}