import type { MetricKind } from "./metric-kind";
import type { MetricUnit } from "./metric-unit";

/**
 * Defines the metadata for a platform metric.
 */
export interface MetricDefinition {
  /**
   * Unique metric identifier.
   */
  id: string;

  /**
   * Metric display name.
   */
  name: string;

  /**
   * Description of the metric.
   */
  description?: string;

  /**
   * Structural type.
   */
  kind: MetricKind;

  /**
   * Measurement unit.
   */
  unit?: MetricUnit;
}