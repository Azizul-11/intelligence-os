/** Unit used to measure a metric. */
export interface MetricUnit {
  /** Short unit symbol, e.g. %, USD, kg, days. */
  symbol: string;

  /** Human-readable unit name. */
  name: string;
}