/**
 * Unit used to measure a metric.
 */
export interface MetricUnit {
  /**
   * Short unit symbol.
   * Examples:
   * %, USD, kg, days
   */
  symbol: string;

  /**
   * Human-readable unit name.
   */
  name: string;
}