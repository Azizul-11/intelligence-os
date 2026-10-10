// src/query-planner.ts
import { Normalizer as Normalizer2 } from "@intelligence/semantic";

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
  "order",
  // Bug G: "strongest" was missing, silently returning unranked results.
  // "strong" deliberately NOT added - collides with "STRONG MEMORIAL HOSPITAL".
  "strongest"
]);
var COMPARISON_KEYWORDS = /* @__PURE__ */ new Set(["compare", "vs", "versus"]);
var TREND_KEYWORDS = /* @__PURE__ */ new Set(["trend"]);
var AGGREGATION_KEYWORDS = /* @__PURE__ */ new Set(["average", "count", "total"]);
var INTENT_KEYWORDS = /* @__PURE__ */ new Set([
  ...RANKING_KEYWORDS,
  ...COMPARISON_KEYWORDS,
  ...TREND_KEYWORDS,
  ...AGGREGATION_KEYWORDS
]);
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
      concepts: matches.filter(
        (match) => match.semanticType === "concept"
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

// src/requested-count.ts
var COUNT = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)";
var COUNT_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};
function requestedCount(question) {
  const text = question.toLowerCase().replace(/-/g, " ");
  const match = text.match(new RegExp(`\\b(?:top|bottom|best|worst|highest|lowest)\\s+${COUNT}\\b(?!\\s*stars?\\b)`)) ?? text.match(new RegExp(`\\b${COUNT}\\s+(?:best|worst|top|bottom|highest|lowest|safest)\\b`));
  const count = match?.[1] ? COUNT_WORDS[match[1]] ?? Number(match[1]) : void 0;
  return count !== void 0 && count > 0 ? count : void 0;
}

// src/query-planner.ts
var QUESTION_FILLER_WORDS = /* @__PURE__ */ new Set([
  "show",
  "me",
  "tell",
  "give",
  "find",
  "get",
  "list",
  "what",
  "whats",
  "who",
  "whos",
  "which",
  "where",
  "when",
  "how",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "can",
  "could",
  "would",
  "will",
  "should",
  "i",
  "you",
  "we",
  "us",
  "our",
  "your",
  "please",
  "want",
  "need",
  "know",
  "about",
  "there",
  "any",
  "some",
  "s",
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on",
  "and",
  "or"
]);
var FUNCTION_WORDS = /* @__PURE__ */ new Set([
  "with",
  "have",
  "has",
  "had",
  "from",
  "by",
  "at",
  "than",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "their",
  "them",
  "they",
  "be",
  "been",
  "being",
  "also",
  "between",
  "among",
  // Batch 3: "rated" ("highest rated hospitals") is consumed into its metric by lexical rewrite, so it carries no constraint of its own.
  "rated"
]);
var QueryPlanner = class _QueryPlanner {
  /** Batch 5A-1: filler words the domain declares as data, read like QUESTION_FILLER_WORDS. */
  domainFillerWords;
  constructor(options = {}) {
    this.domainFillerWords = new Set((options.fillerWords ?? []).map((word) => word.toLowerCase()));
  }
  intentDetector = new QueryIntentDetector();
  collector = new SemanticCollector();
  entityParameterResolver = new EntityParameterResolver();
  createPlan(semantic, domainMetrics = [], forcedIntent, domainEntities = []) {
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
    let discoveredDefaultRanking = false;
    const hasOnlyNonRankableMetrics = collections.metrics.length > 0 && collections.metrics.every(
      (metric) => metric.definition.rankable === false
    );
    const hasNonGeographicScopeEntity = collections.entities.some(
      (entity) => entity.definition.category?.isGeographicScope !== true
    );
    const hasUniqueRecordEntity = collections.entities.some(
      (entity) => entity.definition.identifiesUniqueRecord === true
    );
    if (collections.metrics.length === 0) {
      const discoveredComparable = this.discoverComparableMetrics(
        collections.entities,
        domainMetrics
      );
      if (discoveredComparable.length > 0) {
        collections.metrics = discoveredComparable;
        discoveredComparableMetrics = true;
      }
    }
    if (!discoveredComparableMetrics && !hasUniqueRecordEntity && (collections.metrics.length === 0 || hasOnlyNonRankableMetrics && hasNonGeographicScopeEntity)) {
      const discoveredDefault = this.discoverDefaultRankableMetric(
        collections.entities,
        domainMetrics,
        semantic.normalizedQuery,
        semantic.matches,
        domainEntities
      );
      if (discoveredDefault.length === 0) {
        return {
          success: false,
          plan: null
        };
      }
      collections.metrics = discoveredDefault;
      discoveredDefaultRanking = true;
    }
    if (collections.metrics.length === 0 && hasUniqueRecordEntity && collections.entities.length > 0 && !forcedIntent) {
      const firstEntity = collections.entities.find((entity) => entity.definition.identifiesUniqueRecord === true) ?? collections.entities[0];
      if (firstEntity) {
        const entityType = firstEntity.canonicalKey;
        const detailMetricId = `${entityType}-detail`;
        const detailMetric = domainMetrics.find((m) => m.id === detailMetricId && m.rankable === false);
        if (detailMetric) {
          collections.metrics = [
            {
              phrase: firstEntity.phrase,
              canonicalKey: detailMetric.id,
              semanticType: "metric",
              definition: detailMetric,
              confidence: 1,
              start: firstEntity.start,
              end: firstEntity.end,
              isFallback: true
            }
          ];
        }
      }
    }
    let intent = forcedIntent ? forcedIntent : discoveredComparableMetrics ? "comparison" : discoveredDefaultRanking ? "ranking" : this.intentDetector.detect(
      semantic.originalQuery
    );
    if (intent === "aggregation" && collections.relationships.length > 0 || intent === "lookup" && collections.relationships.length > 0 && collections.benchmarks.length > 0) {
      intent = "ranking";
    }
    const finalCollections = {
      ...collections,
      metrics: this.filterNonAnalyticalSecondaryMetrics(
        this.filterFallbackMetrics(
          this.filterMetricsForIntent(collections.metrics, intent)
        )
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
  /** Maps a detected intent to the MetricDefinition capability flag it requires - "ranking" needs rankable, etc. */
  static INTENT_CAPABILITY_FLAG = {
    ranking: "rankable",
    aggregation: "aggregatable"
  };
  /** Drops metric candidates that disagree with the intent's required capability, when another candidate agrees - resolves alias collisions. Never empties the list. */
  filterMetricsForIntent(metrics, intent) {
    const capabilityFlag = _QueryPlanner.INTENT_CAPABILITY_FLAG[intent];
    let capable;
    if (capabilityFlag) {
      capable = metrics.filter(
        (metric) => metric.definition[capabilityFlag] === true
      );
    } else {
      return metrics;
    }
    if (capable.length === 0 || capable.length === metrics.length) {
      return metrics;
    }
    return capable;
  }
  /** Suppresses a fallback-idiom metric candidate (e.g. "best <entities>") when an explicitly-typed one is also present. */
  filterFallbackMetrics(metrics) {
    const explicit = metrics.filter((metric) => !metric.isFallback);
    if (explicit.length === 0 || explicit.length === metrics.length) {
      return metrics;
    }
    return explicit;
  }
  /** Bug F: a capability-less metric (e.g. "hospital-list") only makes sense as the PRIMARY metric - drops it when it's a non-primary secondary instead, so it's an accounted-for removal, not a silent vanish. */
  filterNonAnalyticalSecondaryMetrics(metrics) {
    if (metrics.length <= 1) {
      return metrics;
    }
    const [primary, ...rest] = metrics;
    const secondary = rest.filter((metric) => {
      const definition = metric.definition;
      const hasNoAnalyticalCapability = definition.rankable === false && definition.aggregatable === false && definition.benchmarkable === false;
      return !hasNoAnalyticalCapability;
    });
    return primary ? [primary, ...secondary] : secondary;
  }
  /** Fix Cycle 018: synthesizes metric candidates for a metric-less multi-entity request from the domain's `comparable` metrics. Requires 2+ entities sharing an execution parameter. */
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
  /** Tier0 Task 5 (F12): discovers the default ranking metric for a scope-only request. Skips a unique-record entity, and (Bug E) any question with an unresolved substantive word. */
  discoverDefaultRankableMetric(entities, domainMetrics, normalizedQuery, allMatches, domainEntities) {
    if (entities.length === 0) {
      return [];
    }
    const hasUniqueRecordEntity = entities.some(
      (entity) => entity.definition.identifiesUniqueRecord === true
    );
    if (hasUniqueRecordEntity) {
      return [];
    }
    if (this.hasUnaccountedSubstantiveToken(normalizedQuery, allMatches, domainEntities)) {
      return [];
    }
    const defaultMetric = domainMetrics.find(
      (metric) => metric.defaultRankable === true
    );
    if (!defaultMetric) {
      return [];
    }
    return [
      {
        phrase: defaultMetric.id,
        canonicalKey: defaultMetric.id,
        semanticType: "metric",
        definition: defaultMetric,
        confidence: 1,
        start: 0,
        end: 0,
        isFallback: true
      }
    ];
  }
  /** Bug E: true when the question has a word nothing accounted for, not counting fillers. Also counts a bare entity id like "hospital". */
  hasUnaccountedSubstantiveToken(normalizedQuery, allMatches, domainEntities) {
    return this.unaccountedWords(normalizedQuery, allMatches, domainEntities).length > 0;
  }
  /** True when every word of the question is resolved, a registered entity id, filler, or an intent keyword - a typo or unregistered word returns false. Lets the runtime skip an LLM rewrite on an already-understood question. */
  isFullyUnderstood(normalizedQuery, allMatches, domainEntities) {
    return this.unaccountedWords(normalizedQuery, allMatches, domainEntities, (word) => FUNCTION_WORDS.has(word) || INTENT_KEYWORDS.has(word)).length === 0;
  }
  /** Batch 1: unresolved words of `normalizedQuery`. With `originalQuestion`, only user-typed words that survived a rewrite count (a rewrite-introduced word is harmless). Count/ordering words ("top 5", "lowest first") are exempt. */
  findUnaccountedWords(normalizedQuery, allMatches, domainEntities, originalQuestion) {
    const words = this.unaccountedWords(
      normalizedQuery,
      allMatches,
      domainEntities,
      (word) => FUNCTION_WORDS.has(word) || INTENT_KEYWORDS.has(word)
    );
    if (originalQuestion === void 0) {
      return words;
    }
    const typed = new Set(new Normalizer2().normalize(originalQuestion).split(" ").filter(Boolean));
    const count = requestedCount(originalQuestion);
    const isRequestedLimitToken = (word) => count !== void 0 && (word === String(count) || COUNT_WORDS[word] === count);
    const isOrderingFirst = (word) => word === "first" && /\b(?:highest|lowest|best|worst)\s+first\b/.test(normalizedQuery);
    return words.filter((word) => typed.has(word) && !isRequestedLimitToken(word) && !isOrderingFirst(word));
  }
  unaccountedWords(normalizedQuery, allMatches, domainEntities, alsoIgnore = () => false) {
    const consumedWords = /* @__PURE__ */ new Set();
    for (const match of allMatches) {
      for (const word of `${match.phrase} ${match.consumedText ?? ""}`.toLowerCase().split(/\s+/)) {
        if (word) {
          consumedWords.add(word);
        }
      }
    }
    for (const entity of domainEntities) {
      const id = entity.id.toLowerCase();
      consumedWords.add(id);
      consumedWords.add(`${id}s`);
    }
    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
    return queryWords.filter(
      (word) => !consumedWords.has(word) && !QUESTION_FILLER_WORDS.has(word) && !this.domainFillerWords.has(word) && !alsoIgnore(word)
    );
  }
  /** True when 2+ resolved entities share the same execution parameter (Phase 7.5.3's multi-entity "in"-filter signal). */
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
var PERFORMANCE_COMPARISON_WORDS = /* @__PURE__ */ new Set([
  "performing",
  "outperform",
  "outperforms",
  "outperforming",
  "underperforming",
  "beat",
  "beats",
  "beating",
  "better",
  "worse"
]);
var ExecutionPlanMapper = class {
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
  /** Distinct metrics carried by this plan, each with its own ranking direction. Deduplicates by canonicalKey - exhaustive phrase extraction can match the same metric via more than one phrase. */
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
        direction: this.performanceDirection(candidate) ?? "desc"
      });
    }
    return metrics;
  }
  /** Batch 3: normalizes ranking direction to "desc"=best first, "asc"=worst first - flips for a lower-is-better metric. */
  performanceDirection(candidate) {
    const direction = candidate.direction;
    if (!direction) {
      return void 0;
    }
    const lowerIsBetter = candidate.definition.lowerIsBetter === true;
    if (lowerIsBetter && candidate.directionBasis === "magnitude") {
      return direction === "desc" ? "asc" : "desc";
    }
    return direction;
  }
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
  /** Phase 7.5.3: entities sharing the same execution parameter are grouped into one "in" filter, not one "=" filter each. */
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
    for (const concept of queryPlan.semantic.concepts) {
      const definition = concept.definition;
      const measureCodesByMetric = definition.measureCodesByMetric;
      if (!measureCodesByMetric) {
        continue;
      }
      for (const metric of queryPlan.semantic.metrics) {
        const measureCode = measureCodesByMetric[metric.canonicalKey];
        if (measureCode) {
          filters.push({
            field: "measureCode",
            operator: "=",
            value: measureCode
          });
        }
      }
    }
    return filters;
  }
  buildGrouping(queryPlan) {
    if (queryPlan.semantic.dimensions.length === 0) {
      return void 0;
    }
    return {
      dimensions: queryPlan.semantic.dimensions.map((d) => d.canonicalKey)
    };
  }
  /** Ranking operations order by primary metric descending by default; other operations may not need ordering. */
  buildOrdering(queryPlan, operation) {
    if (operation === "rank") {
      const primaryCandidate = queryPlan.semantic.metrics[0];
      const primaryMetric = primaryCandidate?.canonicalKey;
      if (!primaryMetric) {
        return void 0;
      }
      const requestedDirection = this.performanceDirection(primaryCandidate);
      if (requestedDirection) {
        return {
          field: primaryMetric,
          direction: requestedDirection
        };
      }
      const direction = this.performanceComparison(queryPlan) === "below" ? "asc" : "desc";
      return {
        field: primaryMetric,
        direction
      };
    }
    return void 0;
  }
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
  /** Batch 3: normalizes to "above"=better, "below"=worse - flips a bare number-comparison for a lower-is-better metric. */
  performanceComparison(queryPlan) {
    const { relationships, metrics } = queryPlan.semantic;
    const below = relationships.find((r) => r.canonicalKey === "below-comparison");
    const stated = below ?? relationships.find((r) => r.canonicalKey === "above-comparison");
    if (!stated) {
      return void 0;
    }
    const comparison = below ? "below" : "above";
    const lowerIsBetter = metrics[0]?.definition?.lowerIsBetter === true;
    const judgesResult = stated.phrase.split(" ").some((word) => PERFORMANCE_COMPARISON_WORDS.has(word));
    if (lowerIsBetter && !judgesResult) {
      return comparison === "below" ? "above" : "below";
    }
    return comparison;
  }
  /** RCG-009: requires both a relationship and benchmark candidate; the longer, more specific benchmark match wins. */
  buildBenchmark(queryPlan) {
    const { relationships, benchmarks } = queryPlan.semantic;
    if (relationships.length === 0 || benchmarks.length === 0) {
      return void 0;
    }
    const comparison = this.performanceComparison(queryPlan);
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
      const definition = candidate.definition;
      const measureCodesByMetric = definition.measureCodesByMetric;
      const consumedAsMeasureCodeFilter = measureCodesByMetric !== void 0 && plan.filters.some(
        (filter) => filter.field === "measureCode" && Object.values(measureCodesByMetric).includes(filter.value)
      );
      if (!consumedAsMeasureCodeFilter) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason: "Concept candidates are not collected by SemanticCollector and never reach the planner."
        });
      }
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
function detectSubsumedBenchmarkRisk(candidates, normalizedQuery, aliasDefinitions) {
  const hasRelationship = candidates.some(
    (candidate) => candidate.semanticType === "relationship"
  );
  if (!hasRelationship) {
    return null;
  }
  const benchmarkCandidates = candidates.filter(
    (candidate) => candidate.semanticType === "benchmark"
  );
  const queryWords = new Set(normalizedQuery.split(" ").filter(Boolean));
  for (const candidate of benchmarkCandidates) {
    const fallbackAlias = aliasDefinitions.find(
      (alias) => alias.canonical === candidate.canonicalKey && alias.genericFallbackOf
    );
    if (!fallbackAlias?.genericFallbackOf) {
      continue;
    }
    const parentAlreadyResolved = benchmarkCandidates.some(
      (other) => other.canonicalKey === fallbackAlias.genericFallbackOf
    );
    if (parentAlreadyResolved) {
      continue;
    }
    const parentAlias = aliasDefinitions.find(
      (alias) => alias.canonical === fallbackAlias.genericFallbackOf
    );
    if (!parentAlias) {
      continue;
    }
    const interruptedPhrase = parentAlias.aliases.find((phrase) => {
      const words = phrase.toLowerCase().split(" ").filter(Boolean);
      return words.length > 1 && words.every((word) => queryWords.has(word));
    });
    if (interruptedPhrase) {
      return {
        parentPhrase: interruptedPhrase,
        fallbackPhrase: fallbackAlias.aliases[0] ?? candidate.phrase
      };
    }
  }
  return null;
}
export {
  COUNT,
  COUNT_WORDS,
  ExecutionPlanMapper,
  INTENT_KEYWORDS,
  QueryIntentDetector,
  QueryPlanner,
  SemanticCollector,
  assessPlanCompleteness,
  detectSubsumedBenchmarkRisk,
  hasRelationshipWithoutBenchmark,
  requestedCount
};
