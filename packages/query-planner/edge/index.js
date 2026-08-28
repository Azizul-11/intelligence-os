// src/query-intent-detector.ts
import { Normalizer } from "@intelligence/semantic";
var RANKING_KEYWORDS = /* @__PURE__ */ new Set([
  "highest",
  "lowest",
  "best",
  "worst",
  "top",
  "bottom",
  "better",
  "largest",
  "smallest",
  "greatest",
  "least",
  "ranked",
  "rank",
  "order"
]);
var COMPARISON_KEYWORDS = /* @__PURE__ */ new Set(["compare", "vs", "versus"]);
var TREND_KEYWORDS = /* @__PURE__ */ new Set(["trend"]);
var AGGREGATION_KEYWORDS = /* @__PURE__ */ new Set(["average", "count", "total"]);
var QueryIntentDetector = class {
  normalizer = new Normalizer();
  detect(question) {
    const normalized = this.normalizer.normalize(question);
    const tokens = new Set(normalized.split(" ").filter(Boolean));
    if (this.hasAnyToken(tokens, RANKING_KEYWORDS)) {
      return "ranking";
    }
    if (this.hasAnyToken(tokens, COMPARISON_KEYWORDS)) {
      return "comparison";
    }
    if (this.hasAnyToken(tokens, TREND_KEYWORDS) || normalized.includes("over time")) {
      return "trend";
    }
    if (this.hasAnyToken(tokens, AGGREGATION_KEYWORDS) || normalized.includes("how many") || normalized.includes("number of")) {
      return "aggregation";
    }
    return "lookup";
  }
  hasAnyToken(tokens, keywords) {
    for (const keyword of keywords) {
      if (tokens.has(keyword)) {
        return true;
      }
    }
    return false;
  }
};

// src/semantic-collector.ts
var SemanticCollector = class {
  collect(matches) {
    return {
      metrics: matches.filter(
        (match) => match.semanticType === "metric"
      ),
      entities: matches.filter(
        (match) => match.semanticType === "entity"
      ),
      dimensions: matches.filter(
        (match) => match.semanticType === "dimension"
      ),
      categories: matches.filter(
        (match) => match.semanticType === "category"
      ),
      benchmarks: matches.filter(
        (match) => match.semanticType === "benchmark"
      ),
      relationships: matches.filter(
        (match) => match.semanticType === "relationship"
      )
    };
  }
};

// src/group-entity-values.ts
function groupEntityValues(entries) {
  const grouped = /* @__PURE__ */ new Map();
  for (const { key, value } of entries) {
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.includes(value)) {
        existing.push(value);
      }
    } else {
      grouped.set(key, [value]);
    }
  }
  return grouped;
}

// src/entity-parameter-resolver.ts
var EntityParameterResolver = class {
  resolve(semantic) {
    const parameters = {};
    const entries = [];
    for (const entity of semantic.entities) {
      const definition = entity.definition;
      const execution = definition.execution;
      if (!execution) {
        continue;
      }
      entries.push({
        key: execution.parameter,
        value: entity.resolvedValue ?? entity.phrase
      });
    }
    for (const [parameter, values] of groupEntityValues(entries)) {
      parameters[parameter] = values.length === 1 ? values[0] : values;
    }
    return parameters;
  }
};

// src/query-planner.ts
var QueryPlanner = class _QueryPlanner {
  intentDetector = new QueryIntentDetector();
  collector = new SemanticCollector();
  entityParameterResolver = new EntityParameterResolver();
  createPlan(semantic, domainMetrics = []) {
    if (semantic.ambiguityError) {
      return {
        success: false,
        plan: null,
        error: semantic.ambiguityError
      };
    }
    if (!semantic.resolved) {
      return {
        success: false,
        plan: null
      };
    }
    const collections = this.collector.collect(
      semantic.matches
    );
    let discoveredComparableMetrics = false;
    if (collections.metrics.length === 0) {
      const discovered = this.discoverComparableMetrics(
        collections.entities,
        domainMetrics
      );
      if (discovered.length === 0) {
        return {
          success: false,
          plan: null
        };
      }
      collections.metrics = discovered;
      discoveredComparableMetrics = true;
    }
    let intent = discoveredComparableMetrics ? "comparison" : this.intentDetector.detect(
      semantic.originalQuery
    );
    if (intent === "aggregation" && collections.relationships.length > 0) {
      intent = "ranking";
    }
    const finalCollections = {
      ...collections,
      metrics: this.filterFallbackMetrics(
        this.filterMetricsForIntent(collections.metrics, intent)
      )
    };
    const parameters = this.entityParameterResolver.resolve(
      finalCollections
    );
    console.log("========== QUERY PLANNER ==========");
    console.log("Semantic Collections");
    console.log({
      metrics: finalCollections.metrics,
      entities: finalCollections.entities,
      dimensions: finalCollections.dimensions,
      categories: finalCollections.categories,
      benchmarks: finalCollections.benchmarks,
      relationships: finalCollections.relationships
    });
    console.log("Intent :", intent);
    return {
      success: true,
      plan: {
        semantic: finalCollections,
        intent,
        parameters,
        filters: []
      }
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
  static INTENT_CAPABILITY_FLAG = {
    ranking: "rankable",
    aggregation: "aggregatable"
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
  filterMetricsForIntent(metrics, intent) {
    const capabilityFlag = _QueryPlanner.INTENT_CAPABILITY_FLAG[intent];
    let capable;
    if (capabilityFlag) {
      capable = metrics.filter(
        (metric) => metric.definition[capabilityFlag] === true
      );
    } else if (intent === "lookup") {
      capable = metrics.filter(
        (metric) => this.isAnalyticallyCapable(metric.definition)
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
  isAnalyticallyCapable(definition) {
    return Boolean(
      definition.rankable || definition.benchmarkable || definition.aggregatable
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
  filterFallbackMetrics(metrics) {
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
  discoverComparableMetrics(entities, domainMetrics) {
    if (domainMetrics.length === 0) {
      return [];
    }
    if (!this.hasComparableEntitySet(entities)) {
      return [];
    }
    const comparableMetrics = domainMetrics.filter(
      (metric) => metric.comparable === true
    );
    return comparableMetrics.map((metric) => ({
      phrase: metric.id,
      canonicalKey: metric.id,
      semanticType: "metric",
      definition: metric,
      confidence: 1,
      start: 0,
      end: 0,
      isFallback: true
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
  hasComparableEntitySet(entities) {
    const countByParameter = /* @__PURE__ */ new Map();
    for (const entity of entities) {
      const definition = entity.definition;
      if (!definition.execution) {
        continue;
      }
      const parameter = definition.execution.parameter;
      countByParameter.set(
        parameter,
        (countByParameter.get(parameter) ?? 0) + 1
      );
    }
    for (const count of countByParameter.values()) {
      if (count >= 2) {
        return true;
      }
    }
    return false;
  }
};

// src/execution-plan-mapper.ts
var ExecutionPlanMapper = class {
  /**
   * Map QueryPlan to ExecutionPlan.
   *
   * Converts semantic collections and intent into execution structure.
   */
  map(queryPlan) {
    const primaryMetric = this.extractPrimaryMetric(queryPlan);
    const operation = this.mapIntent(queryPlan.intent);
    const filters = this.buildFilters(queryPlan);
    const grouping = this.buildGrouping(queryPlan);
    const metrics = this.buildMetrics(queryPlan);
    const isMultiMetric = metrics.length > 1;
    const ordering = isMultiMetric ? void 0 : this.buildOrdering(queryPlan, operation);
    const limit = this.buildLimit(queryPlan);
    const benchmark = this.buildBenchmark(queryPlan);
    const plan = {
      operation,
      metric: primaryMetric,
      filters,
      parameters: queryPlan.parameters
    };
    if (isMultiMetric) {
      plan.metrics = metrics;
    }
    if (grouping !== void 0) {
      plan.grouping = grouping;
    }
    if (ordering !== void 0) {
      plan.ordering = ordering;
    }
    if (limit !== void 0) {
      plan.limit = limit;
    }
    if (benchmark !== void 0) {
      plan.benchmark = benchmark;
    }
    return plan;
  }
  /**
   * Extract primary metric from semantic collections.
   */
  extractPrimaryMetric(queryPlan) {
    if (queryPlan.semantic.metrics.length === 0) {
      throw new Error("ExecutionPlan requires at least one metric");
    }
    const primaryMetric = queryPlan.semantic.metrics[0];
    if (!primaryMetric) {
      throw new Error("ExecutionPlan requires at least one metric");
    }
    return primaryMetric.canonicalKey;
  }
  /**
   * Build the distinct set of metrics carried by this plan, in original
   * semantic order, each paired with its independent ranking direction.
   *
   * Deduplicates by canonicalKey - exhaustive phrase extraction can
   * surface the same canonical metric via more than one matched phrase
   * (e.g. "hospital overall rating" and "overall rating" both matching
   * the same metric), and each distinct metric must appear only once.
   *
   * Direction comes from the semantic layer's modifier-association
   * signal (SemanticCandidate.direction, Phase 6.2). A distinct metric
   * with no associable modifier defaults to "desc", consistent with the
   * existing single-metric default in buildOrdering() below.
   */
  buildMetrics(queryPlan) {
    const seen = /* @__PURE__ */ new Set();
    const metrics = [];
    for (const candidate of queryPlan.semantic.metrics) {
      if (seen.has(candidate.canonicalKey)) {
        continue;
      }
      seen.add(candidate.canonicalKey);
      metrics.push({
        metric: candidate.canonicalKey,
        direction: candidate.direction ?? "desc"
      });
    }
    return metrics;
  }
  /**
   * Map QueryIntent to ExecutionOperation.
   */
  mapIntent(intent) {
    const mapping = {
      lookup: "lookup",
      ranking: "rank",
      comparison: "compare",
      trend: "analyze",
      aggregation: "aggregate"
    };
    return mapping[intent];
  }
  /**
   * Build execution filters from entity parameters.
   *
   * Converts resolved entities into filter constraints.
   *
   * Phase 7.5.3: multiple entities sharing the same execution parameter
   * (e.g. two distinct canonical identities of the same entity type,
   * such as "Memorial Hospital in Texas" and "Memorial Hospital in New
   * York" both being "hospital" entities) are grouped into a single
   * `"in"`-operator filter carrying every distinct value, instead of
   * one `"="` filter per entity - which would silently only ever be
   * usable as the last one added. A field with exactly one distinct
   * value keeps the existing `"="` shape unchanged.
   */
  buildFilters(queryPlan) {
    const entries = [];
    for (const entity of queryPlan.semantic.entities) {
      const definition = entity.definition;
      if (!definition.execution) {
        continue;
      }
      const resolvedValue = entity.resolvedValue ?? entity.phrase;
      entries.push({
        key: definition.execution.parameter,
        value: resolvedValue
      });
    }
    const filters = [];
    for (const [field, values] of groupEntityValues(entries)) {
      if (values.length === 1) {
        filters.push({
          field,
          operator: "=",
          value: values[0]
        });
      } else {
        filters.push({
          field,
          operator: "in",
          value: values
        });
      }
    }
    return filters;
  }
  /**
   * Build grouping from semantic dimensions.
   */
  buildGrouping(queryPlan) {
    if (queryPlan.semantic.dimensions.length === 0) {
      return void 0;
    }
    return {
      dimensions: queryPlan.semantic.dimensions.map((d) => d.canonicalKey)
    };
  }
  /**
   * Build ordering based on operation and metrics.
   *
   * Ranking operations order by primary metric descending.
   * Other operations may not require ordering.
   */
  buildOrdering(queryPlan, operation) {
    if (operation === "rank") {
      const primaryCandidate = queryPlan.semantic.metrics[0];
      const primaryMetric = primaryCandidate?.canonicalKey;
      if (!primaryMetric) {
        return void 0;
      }
      if (primaryCandidate.direction) {
        return {
          field: primaryMetric,
          direction: primaryCandidate.direction
        };
      }
      const hasAbove = queryPlan.semantic.relationships.some(
        (r) => r.canonicalKey === "above-comparison"
      );
      const hasBelow = queryPlan.semantic.relationships.some(
        (r) => r.canonicalKey === "below-comparison"
      );
      let direction = "desc";
      if (hasBelow) {
        direction = "asc";
      }
      return {
        field: primaryMetric,
        direction
      };
    }
    return void 0;
  }
  /**
   * Build execution limit.
   *
   * Apply default limit for operations that typically need them.
   */
  buildLimit(queryPlan) {
    if (queryPlan.intent === "ranking" || queryPlan.intent === "lookup") {
      return {
        value: 10,
        // Default limit
        offset: 0
      };
    }
    if (queryPlan.intent === "aggregation") {
      if (queryPlan.semantic.dimensions.length > 0) {
        return {
          value: 100,
          // Higher limit for grouped aggregations
          offset: 0
        };
      }
    }
    return void 0;
  }
  /**
   * RCG-009: build a benchmark comparison from semantic `relationship`
   * and `benchmark` candidates.
   *
   * Requires BOTH a `relationship` candidate (e.g. "above"/"below" -
   * the signal that this is a genuine comparison request, not merely a
   * sentence that happens to mention a benchmark word - see RCG-009b)
   * AND a `benchmark` candidate (the reference value itself, e.g.
   * "national average"). Domain-agnostic: only ever reads the two
   * Universal semantic-type categories `relationship`/`benchmark` -
   * never a domain-specific canonical id.
   *
   * When more than one benchmark candidate is present (exhaustive
   * phrase extraction can match both a qualified phrase, e.g. "national
   * average", and the bare word "average" within it), the longer,
   * more specific phrase match is preferred - a generic
   * disambiguation rule, not one that inspects which canonical id is
   * involved.
   */
  buildBenchmark(queryPlan) {
    const { relationships, benchmarks } = queryPlan.semantic;
    if (relationships.length === 0 || benchmarks.length === 0) {
      return void 0;
    }
    const comparison = relationships.some(
      (r) => r.canonicalKey === "below-comparison"
    ) ? "below" : relationships.some((r) => r.canonicalKey === "above-comparison") ? "above" : void 0;
    if (!comparison) {
      return void 0;
    }
    const primaryBenchmark = [...benchmarks].sort(
      (a, b) => b.end - b.start - (a.end - a.start)
    )[0];
    return {
      benchmark: primaryBenchmark.canonicalKey,
      comparison
    };
  }
};

// src/plan-completeness.ts
function assessPlanCompleteness(candidates, plan, plannedSemantic) {
  const discrepancies = [];
  const planMetricKeys = /* @__PURE__ */ new Set([
    plan.metric,
    ...plan.metrics?.map((metric) => metric.metric) ?? []
  ]);
  const plannedMetricKeys = new Set(
    plannedSemantic.metrics.map((metric) => metric.canonicalKey)
  );
  const filterValues = /* @__PURE__ */ new Set();
  for (const filter of plan.filters) {
    if (Array.isArray(filter.value)) {
      for (const value of filter.value) {
        filterValues.add(value);
      }
    } else {
      filterValues.add(filter.value);
    }
  }
  const groupingDimensions = new Set(plan.grouping?.dimensions ?? []);
  const benchmarkCandidates = candidates.filter(
    (candidate) => candidate.semanticType === "benchmark"
  );
  const primaryBenchmark = [...benchmarkCandidates].sort(
    (a, b) => b.end - b.start - (a.end - a.start)
  )[0];
  const hasRelationship = candidates.some(
    (candidate) => candidate.semanticType === "relationship"
  );
  for (const candidate of candidates) {
    if (candidate.semanticType === "metric") {
      if (!plannedMetricKeys.has(candidate.canonicalKey)) {
        continue;
      }
      if (!planMetricKeys.has(candidate.canonicalKey)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason: "Resolved metric candidate does not appear in plan.metric or plan.metrics."
        });
      }
      continue;
    }
    if (candidate.semanticType === "entity") {
      const definition = candidate.definition;
      if (!definition.execution) {
        continue;
      }
      const value = candidate.resolvedValue ?? candidate.phrase;
      if (!filterValues.has(value)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason: "Resolved entity candidate's value does not appear in any plan.filters entry."
        });
      }
      continue;
    }
    if (candidate.semanticType === "dimension") {
      if (!groupingDimensions.has(candidate.canonicalKey)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason: "Resolved dimension candidate does not appear in plan.grouping."
        });
      }
      continue;
    }
    if (candidate.semanticType === "category") {
      discrepancies.push({
        semanticType: candidate.semanticType,
        phrase: candidate.phrase,
        canonicalKey: candidate.canonicalKey,
        reason: "Category candidates are not consumed by any existing planning mechanism."
      });
      continue;
    }
    if (candidate.semanticType === "concept") {
      discrepancies.push({
        semanticType: candidate.semanticType,
        phrase: candidate.phrase,
        canonicalKey: candidate.canonicalKey,
        reason: "Concept candidates are not collected by SemanticCollector and never reach the planner."
      });
      continue;
    }
    if (candidate.semanticType === "benchmark") {
      if (!hasRelationship) {
        continue;
      }
      if (candidate === primaryBenchmark) {
        if (plan.benchmark?.benchmark !== candidate.canonicalKey) {
          discrepancies.push({
            semanticType: candidate.semanticType,
            phrase: candidate.phrase,
            canonicalKey: candidate.canonicalKey,
            reason: "The most specific resolved benchmark candidate does not match plan.benchmark."
          });
        }
      }
      continue;
    }
  }
  return {
    complete: discrepancies.length === 0,
    discrepancies
  };
}

// src/candidate-consistency.ts
function hasRelationshipWithoutBenchmark(candidates) {
  const hasRelationship = candidates.some(
    (candidate) => candidate.semanticType === "relationship"
  );
  const hasBenchmark = candidates.some(
    (candidate) => candidate.semanticType === "benchmark"
  );
  return hasRelationship && !hasBenchmark;
}
export {
  ExecutionPlanMapper,
  QueryIntentDetector,
  QueryPlanner,
  SemanticCollector,
  assessPlanCompleteness,
  hasRelationshipWithoutBenchmark
};
