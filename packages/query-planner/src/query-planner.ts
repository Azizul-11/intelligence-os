import type { SemanticResolutionResult } from "@intelligence/semantic";

import { QueryIntentDetector } from "./query-intent-detector";

import type { QueryPlanResult } from "./query-plan-result";
import { SemanticCollector } from "./semantic-collector";

import { EntityParameterResolver } from "./entity-parameter-resolver";

export class QueryPlanner {
  private readonly intentDetector =
    new QueryIntentDetector();

  private readonly collector =
    new SemanticCollector();

    private readonly entityParameterResolver =
  new EntityParameterResolver();

  createPlan(
    semantic: SemanticResolutionResult,
  ): QueryPlanResult {
    const collections =
      this.collector.collect(
        semantic.matches,
      );

    if (
      !semantic.resolved ||
      collections.metrics.length === 0
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

      const parameters =
  this.entityParameterResolver.resolve(
    collections,
  );

    console.log("========== QUERY PLANNER ==========");
    console.log("Semantic Collections");
    console.log({
      metrics: collections.metrics,
      entities: collections.entities,
      dimensions: collections.dimensions,
      categories: collections.categories,
      benchmarks: collections.benchmarks,
      relationships: collections.relationships,
    });

    console.log("Intent :", intent);

    return {
  success: true,
  plan: {
    semantic: collections,

    intent,

    parameters,

    filters: [],
  },
};
  }
}