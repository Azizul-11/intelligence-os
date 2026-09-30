/** What QueryPlanner.createPlan() returns: a built plan, or a failure with an optional specific reason. */
import type { QueryPlan } from "./query-plan";

export interface QueryPlanResult {
  success: boolean;

  plan: QueryPlan | null;

  /** RCG-010: a specific failure reason (e.g. a direction contradiction), when available. */
  error?: string;
}