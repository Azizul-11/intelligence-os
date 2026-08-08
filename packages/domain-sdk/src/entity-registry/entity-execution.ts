/**
 * Execution metadata used by the universal planner/runtime.
 *
 * This contains no SQL-specific or domain-specific knowledge.
 * It simply tells the platform which execution parameter
 * this entity should populate.
 */
export interface EntityExecution {
  /**
   * Universal execution parameter name.
   *
   * Examples:
   *  state
   *  hospital
   *  district
   *  company
   *  customer
   */
  parameter: string;
}