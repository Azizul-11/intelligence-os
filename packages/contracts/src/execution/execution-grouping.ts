/**
 * Universal execution grouping.
 *
 * Represents how results should be grouped or aggregated.
 * Typically corresponds to dimensions in analytics queries.
 */
export interface ExecutionGrouping {
  /**
   * Dimensions to group by.
   */
  dimensions: string[];
}
