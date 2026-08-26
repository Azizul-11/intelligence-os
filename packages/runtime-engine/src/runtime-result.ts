import type { PlanCompletenessReport } from "@intelligence/query-planner";

export interface RuntimeResult<T = unknown> {
  success: boolean;

  rows: T[];

  rowCount: number;

  error?: string;

  /**
   * Pre-Phase 8 semantic-completeness check: whether every semantically
   * resolved candidate was accounted for in the ExecutionPlan that
   * produced this result. Diagnostic only - present only on a
   * successful execution where a plan was actually built; never
   * present, and never inspected, on any failure path. Domain-agnostic,
   * additive, and not yet consumed by any caller - reserved for a
   * future Phase 8 answerability layer.
   */
  completeness?: PlanCompletenessReport;
}