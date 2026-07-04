import type { MetricUnit } from "./metric-unit";

/**
 * Represents the measured value of a metric.
 */
export interface MetricValue {
  /**
   * Actual measured value.
   */
  value: number | string | boolean;

  /**
   * Unit of measurement.
   */
  unit?: MetricUnit;
}