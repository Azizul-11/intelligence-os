import type { QueryPlan } from "./query-plan";

export interface QueryPlanResult {
  success: boolean;

  plan: QueryPlan | null;

  /**
   * RCG-010: a specific, natural-language reason for failure (e.g. a
   * detected direction contradiction), when available. Mirrors the
   * existing RuntimeResult.error convention. Absent for the ordinary
   * generic-failure case.
   */
  error?: string;
}