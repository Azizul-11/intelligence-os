import type { SemanticResolutionResult } from "@intelligence/semantic";

import { QueryIntentDetector } from "./query-intent-detector";

import type { QueryPlanResult } from "./query-plan-result";


export class QueryPlanner {
  private readonly intentDetector =
    new QueryIntentDetector();
  
  
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

    const intent =
      this.intentDetector.detect(
        semantic.originalQuery,
      );

      console.log("========== QUERY PLANNER ==========");
console.log("Metric :", semantic.canonicalKey);
console.log("Intent :", intent);
      

    console.log("Planner Intent:", intent);

    return {
      success: true,
      plan: {
    metricId: semantic.canonicalKey,
    intent,
    dimensions: [],
    filters: [],
},
    };
  }
}