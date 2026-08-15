/**
 * Universal execution plan metric.
 *
 * Represents a single metric criterion within a multi-metric plan -
 * a canonical metric identifier paired with its independent ranking
 * direction. Domain-agnostic - carries no execution or SQL detail.
 *
 * Phase 6: introduced to let ExecutionPlan represent more than one
 * metric, each with its own direction, without replacing the existing
 * single `metric` field.
 */
export interface ExecutionPlanMetric {
  /**
   * Canonical metric identifier from the domain registry.
   */
  metric: string;

  /**
   * Ranking direction for this metric.
   */
  direction: "asc" | "desc";
}
