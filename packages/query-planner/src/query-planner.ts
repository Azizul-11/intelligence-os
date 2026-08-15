import type { SemanticResolutionResult, SemanticCandidate } from "@intelligence/semantic";
import type { MetricDefinition } from "@intelligence/domain-sdk";

import { QueryIntentDetector } from "./query-intent-detector";

import type { QueryPlanResult } from "./query-plan-result";
import type { QueryIntent } from "./query-intent";
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

    // Disambiguate metric candidates against the detected intent using
    // each metric's own generic, domain-declared capability metadata
    // (MetricDefinition.rankable). This is not domain-specific: it only
    // ever consumes a flag every domain's metrics already declare, and
    // only ever narrows a genuine mix of candidates - it never touches
    // a query where every candidate agrees.
    const finalCollections = {
      ...collections,
      metrics: this.filterMetricsForIntent(collections.metrics, intent),
    };

      const parameters =
  this.entityParameterResolver.resolve(
    finalCollections,
  );

    console.log("========== QUERY PLANNER ==========");
    console.log("Semantic Collections");
    console.log({
      metrics: finalCollections.metrics,
      entities: finalCollections.entities,
      dimensions: finalCollections.dimensions,
      categories: finalCollections.categories,
      benchmarks: finalCollections.benchmarks,
      relationships: finalCollections.relationships,
    });

    console.log("Intent :", intent);

    return {
  success: true,
  plan: {
    semantic: finalCollections,

    intent,

    parameters,

    filters: [],
  },
};
  }

  /**
   * Excludes metric candidates whose own definition declares them
   * non-rankable, when the query's detected intent is "ranking" AND at
   * least one OTHER candidate in the same query IS rankable.
   *
   * This resolves a class of alias collisions where a generic,
   * non-rankable metric phrase (e.g. one that also matches ordinary
   * connective language describing an entity, such as "<things> in
   * <place>") coincidentally overlaps with the start of a sentence that
   * is actually asking to rank other, genuinely rankable metrics.
   *
   * Deliberately conservative: never produces an empty metrics list,
   * and never touches a query where every candidate already agrees
   * (all rankable, or all non-rankable) - a standalone query for a
   * non-rankable metric is completely unaffected.
   */
  private filterMetricsForIntent(
    metrics: SemanticCandidate[],
    intent: QueryIntent,
  ): SemanticCandidate[] {
    if (intent !== "ranking") {
      return metrics;
    }

    const rankable = metrics.filter(
      (metric) => (metric.definition as MetricDefinition).rankable === true,
    );

    if (rankable.length === 0 || rankable.length === metrics.length) {
      return metrics;
    }

    return rankable;
  }
}