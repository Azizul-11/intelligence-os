import type { QueryPlan } from "./query-plan";

export interface QueryPlanResult {
  success: boolean;

  plan: QueryPlan | null;
}