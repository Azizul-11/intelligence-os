import type { SemanticResolutionResult } from "@intelligence/semantic";

import type { QueryPlanResult } from "./query-plan-result";

export class QueryPlanner {
  createPlan(
    semantic: SemanticResolutionResult,
  ): QueryPlanResult {
    if (
      !semantic.resolved ||
      !semantic.canonicalKey
    ) {
      return {
        success: false,
        plan: null,
      };
    }

    return {
      success: true,
      plan: {
        metricId: semantic.canonicalKey,
        dimensions: [],
        filters: [],
      },
    };
  }
}