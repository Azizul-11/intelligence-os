import type { SemanticResolutionResult, SemanticCandidate } from "@intelligence/semantic";
import type { MetricDefinition, EntityDefinition } from "@intelligence/domain-sdk";

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
    domainMetrics: readonly MetricDefinition[] = [],
  ): QueryPlanResult {
    // RCG-010: a detected direction contradiction is reported as a
    // specific, natural-language failure rather than silently
    // resolving to one direction or falling through to the generic
    // "Unable to create query plan." message.
    if (semantic.ambiguityError) {
      return {
        success: false,
        plan: null,
        error: semantic.ambiguityError,
      };
    }

    if (!semantic.resolved) {
      return {
        success: false,
        plan: null,
      };
    }

    const collections =
      this.collector.collect(
        semantic.matches,
      );

    // Fix Cycle 018 (Option A): a request naming 2+ entities of the
    // same execution-parameter type with NO metric mentioned anywhere
    // ("Compare Mayo Clinic and Cleveland Clinic") is not rejected
    // outright the way any other zero-metric request is - it is offered
    // to the active Domain SDK's own declared set of `comparable`
    // metrics (see MetricDefinition.comparable). This never inspects
    // which domain or which metric is involved: `domainMetrics` is
    // supplied generically by the runtime wiring layer (see
    // create-runtime-engine.ts), and a domain that declares zero
    // comparable metrics - or a request with fewer than 2 comparable
    // entities - falls through to the original, unchanged failure
    // below, exactly as before this cycle.
    let discoveredComparableMetrics = false;

    if (collections.metrics.length === 0) {
      const discovered = this.discoverComparableMetrics(
        collections.entities,
        domainMetrics,
      );

      if (discovered.length === 0) {
        return {
          success: false,
          plan: null,
        };
      }

      collections.metrics = discovered;
      discoveredComparableMetrics = true;
    }

    // Discovery above already establishes this is a comparison request
    // (2+ comparable entities, no metric named) - keyword-based intent
    // detection is not a reliable signal here (Fix Cycle 018 evidence:
    // "which is better" matches RANKING_KEYWORDS, "what are the
    // differences between" matches no keyword at all), so the intent is
    // set directly rather than inferred from the original text.
    let intent: QueryIntent = discoveredComparableMetrics
      ? "comparison"
      : this.intentDetector.detect(
          semantic.originalQuery,
        );

    // RCG-009b: QueryIntentDetector's own rule ("average"/"count"/
    // "total" -> aggregation) is correct in isolation, but the same
    // benchmark word also appears inside a genuine comparison phrase
    // ("above average", "below the national average") - a
    // structurally different request (filter/rank against a computed
    // reference value, not compute one aggregate). The bare `benchmark`
    // semantic type alone cannot distinguish the two cases: the word
    // "average" always produces a `benchmark` candidate, whether or not
    // a comparison word is present. The candidate that DOES distinguish
    // them is `relationship` (e.g. "above"/"below"), present only in
    // the comparison case. This inspects only the generic Universal
    // semantic-type category, never a domain-specific canonical id, so
    // it is reusable by any future Domain SDK with its own
    // comparison-relationship vocabulary. Reclassified to "ranking" -
    // not "lookup" - because Healthcare's own "lookup" template
    // convention is single-entity detail (requires a specific
    // hospitalId), not a filtered list; "ranking" is the existing
    // intent whose template convention already returns an ordered list,
    // which is what a benchmark-filtered request needs regardless of
    // whether an explicit ranking modifier was also present.
    if (intent === "aggregation" && collections.relationships.length > 0) {
      intent = "ranking";
    }

    // Disambiguate metric candidates against the detected intent using
    // each metric's own generic, domain-declared capability metadata
    // (MetricDefinition.rankable). This is not domain-specific: it only
    // ever consumes a flag every domain's metrics already declare, and
    // only ever narrows a genuine mix of candidates - it never touches
    // a query where every candidate agrees.
    const finalCollections = {
      ...collections,
      metrics: this.filterFallbackMetrics(
        this.filterMetricsForIntent(collections.metrics, intent),
      ),
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
   * Maps a detected intent to the generic, domain-declared
   * MetricDefinition capability flag that should agree with it -
   * "ranking" needs a rankable metric, "aggregation" needs an
   * aggregatable one. Every domain's metrics already declare these
   * flags (see MetricDefinition); this table only ever adds a new
   * (intent, existing-flag) pairing, it never introduces new metadata.
   * An intent with no entry here is left completely unfiltered.
   */
  private static readonly INTENT_CAPABILITY_FLAG: Partial<
    Record<QueryIntent, keyof MetricDefinition>
  > = {
    ranking: "rankable",
    aggregation: "aggregatable",
  };

  /**
   * Excludes metric candidates whose own definition disagrees with the
   * query's detected intent's required capability (see
   * INTENT_CAPABILITY_FLAG), when at least one OTHER candidate in the
   * same query DOES agree.
   *
   * This resolves a class of alias collisions where a generic,
   * incapable-for-this-intent metric phrase (e.g. one that also matches
   * ordinary connective language describing an entity, such as
   * "<things> in <place>", or a phrase like "count <things>" that
   * itself contains a shorter, unrelated metric's alias) coincidentally
   * overlaps with a sentence that is actually asking to rank or
   * aggregate a different, genuinely capable metric.
   *
   * Deliberately conservative: never produces an empty metrics list,
   * and never touches a query where every candidate already agrees (all
   * capable, or all incapable, for the relevant intent) - a standalone
   * query for an incapable metric is completely unaffected. An intent
   * with no capability mapping and no other rule below (comparison,
   * trend) is completely unaffected, exactly as before this
   * generalization.
   *
   * "lookup" intent (the remaining lookup-intent phantom-metric
   * collision, e.g. "show hospitals with the strongest patient
   * experience") has no single required capability the way ranking
   * needs `rankable` or aggregation needs `aggregatable` - a lookup
   * request can legitimately target any kind of metric. The
   * disambiguating signal here is instead whether a candidate has ANY
   * analytical capability at all (see isAnalyticallyCapable below),
   * which distinguishes a genuine analytical metric (e.g.
   * patient-experience) from a pure listing/utility placeholder (e.g.
   * Healthcare's own `hospital-list`, which declares all three
   * capability flags false) - reusing the exact same three existing,
   * already-declared flags, not a new one.
   */
  private filterMetricsForIntent(
    metrics: SemanticCandidate[],
    intent: QueryIntent,
  ): SemanticCandidate[] {
    const capabilityFlag = QueryPlanner.INTENT_CAPABILITY_FLAG[intent];

    let capable: SemanticCandidate[];

    if (capabilityFlag) {
      capable = metrics.filter(
        (metric) => (metric.definition as MetricDefinition)[capabilityFlag] === true,
      );
    } else if (intent === "lookup") {
      capable = metrics.filter((metric) =>
        this.isAnalyticallyCapable(metric.definition as MetricDefinition),
      );
    } else {
      return metrics;
    }

    if (capable.length === 0 || capable.length === metrics.length) {
      return metrics;
    }

    return capable;
  }

  /**
   * True when a metric declares at least one of the existing, generic
   * capability flags - i.e. it represents a genuine analytical value
   * (rankable, benchmarkable, and/or aggregatable), as opposed to a
   * pure listing/utility placeholder that declares none of them. Reads
   * only flags every Domain SDK's metrics can already declare; adds no
   * new MetricDefinition field and no domain-specific knowledge.
   */
  private isAnalyticallyCapable(definition: MetricDefinition): boolean {
    return Boolean(
      definition.rankable || definition.benchmarkable || definition.aggregatable,
    );
  }

  /**
   * Suppresses metric candidates whose phrase was introduced by a domain's
   * declared generic-ranking-idiom rewrite rule (e.g. a domain's "best
   * <entities>" idiom implying some default metric in the absence of any
   * more specific one) whenever at least one OTHER, explicitly-typed
   * metric candidate is also present in the same query.
   *
   * This is not domain-specific: it only ever consumes a flag computed
   * generically by SemanticPipeline from LexicalRewriter's own record of
   * which rules it applied (SemanticCandidate.isFallback) - it never
   * inspects which metric or domain is involved - and never touches a
   * query where every candidate agrees (all fallback, or all explicit) -
   * a standalone query relying on the fallback idiom is unaffected, and
   * a metric the user explicitly typed is never suppressed merely for
   * sharing an id with some other fallback-eligible metric.
   */
  private filterFallbackMetrics(
    metrics: SemanticCandidate[],
  ): SemanticCandidate[] {
    const explicit = metrics.filter((metric) => !metric.isFallback);

    if (explicit.length === 0 || explicit.length === metrics.length) {
      return metrics;
    }

    return explicit;
  }

  /**
   * Fix Cycle 018 (Option A): synthesizes metric candidates for a
   * metric-less multi-entity request from the active Domain SDK's own
   * `MetricDefinition.comparable` declarations, instead of from parsed
   * phrases. Domain-agnostic by construction: `domainMetrics` is
   * supplied opaquely by the runtime wiring layer, and this method
   * never inspects which domain, entity type, or metric id is involved
   * - it only ever reads the generic `comparable` flag every Domain
   * SDK's metrics can declare, exactly as `filterMetricsForIntent()`
   * already reads `rankable`/`aggregatable`.
   *
   * Requires at least 2 entities that share the same execution
   * parameter (the same generic signal `ExecutionPlanMapper.
   * buildFilters()`'s `groupEntityValues()` already uses to decide
   * whether a request names an explicit multi-entity set) - a single
   * entity, or entities of unrelated types, never triggers discovery.
   * Returns an empty array (never a partial/guessed result) when the
   * domain declares no comparable metrics, or when fewer than 2
   * comparable entities are present - the caller falls through to the
   * existing, unchanged failure in that case.
   */
  private discoverComparableMetrics(
    entities: SemanticCandidate[],
    domainMetrics: readonly MetricDefinition[],
  ): SemanticCandidate[] {
    if (domainMetrics.length === 0) {
      return [];
    }

    if (!this.hasComparableEntitySet(entities)) {
      return [];
    }

    const comparableMetrics = domainMetrics.filter(
      (metric) => metric.comparable === true,
    );

    return comparableMetrics.map((metric) => ({
      phrase: metric.id,
      canonicalKey: metric.id,
      semanticType: "metric",
      definition: metric,
      confidence: 1,
      start: 0,
      end: 0,
      isFallback: true,
    }));
  }

  /**
   * True when at least 2 resolved entities share the same execution
   * parameter - the same generic entity-grouping signal
   * `ExecutionPlanMapper.buildFilters()` already relies on to build a
   * single `"in"`-operator filter for an explicit multi-entity request
   * (Phase 7.5.3). Entities with no `execution` mapping at all (never
   * usable as a filter) are ignored.
   */
  private hasComparableEntitySet(
    entities: SemanticCandidate[],
  ): boolean {
    const countByParameter = new Map<string, number>();

    for (const entity of entities) {
      const definition = entity.definition as EntityDefinition;

      if (!definition.execution) {
        continue;
      }

      const parameter = definition.execution.parameter;

      countByParameter.set(
        parameter,
        (countByParameter.get(parameter) ?? 0) + 1,
      );
    }

    for (const count of countByParameter.values()) {
      if (count >= 2) {
        return true;
      }
    }

    return false;
  }
}