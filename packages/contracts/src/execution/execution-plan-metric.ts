/** One metric criterion in a multi-metric plan: canonical metric id plus its own ranking direction (Phase 6). */
export interface ExecutionPlanMetric {
  /** Canonical metric identifier from the domain registry. */
  metric: string;

  /** Ranking direction for this metric. */
  direction: "asc" | "desc";
}
