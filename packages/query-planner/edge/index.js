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
  // Bug G (Phase 3.3, 2026-09-18): "strongest" is a plain English
  // superlative, exactly like every other word already in this set -
  // its absence meant a query also containing "compare"/"vs" (which
  // succeeds deterministically via COMPARISON_KEYWORDS on the very
  // first pass) never got a chance to fall through to Layer 1's LLM
  // rewrite (which does normalize "strongest" -> "best"), silently
  // returning an unranked result instead. The Round 6 audit's own fix
  // plan also suggested "strong" - deliberately NOT added here: a
  // direct grep of hospital-identity-directory.ts found a real,
  // confirmed collision ("STRONG MEMORIAL HOSPITAL"), the exact same
  // class of regression already documented for "good"/"great" and real
  // hospital names - adding it would flip `operation` to "rank" for any
  // query naming that hospital. "strongest" itself has zero matches.
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
  // Batch 3: the participle of the "highest rated / top rated hospitals" idiom. A domain's lexical rewrite consumes
  // the whole idiom ("highest rated hospitals" -> its rating metric), so "rated" is never left as a candidate phrase
  // and was reported unaccounted, sending every such question to the LLM front door, which can drop the rest of it
  // ("... in New York by county" lost "by county" about half the time). It carries no constraint of its own.
  "rated"
]);
var QueryPlanner = class _QueryPlanner {
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
      const firstEntity = collections.entities[0];
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
   * with no capability mapping (including "lookup") is completely
   * unaffected.
   *
   * "lookup" intent used to also filter by "any analytical capability at
   * all", to resolve a generic-listing-metric ("hospital-list"-style)
   * phantom collision. Removed: it did not actually make its own
   * motivating example work (a lookup request naming no specific entity
   * has no viable single-record template for a non-listing metric
   * either, filtered or not), and it broke a genuinely-intended case -
   * "hospitals in Birmingham with their overall ratings" - by stripping
   * the listing metric whenever another analytically-capable metric
   * candidate was also present, even though the listing metric was the
   * actual primary subject (extractPrimaryMetric() takes metrics[0], in
   * original phrase order) and the other metric was only ever meant as
   * a secondary, per-row enrichment (Phase 7's existing mechanism).
   */
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
   * Bug F (Phase 3.3, 2026-09-18): a metric with NO analytical
   * capability at all (`rankable`/`aggregatable`/`benchmarkable` all
   * false - e.g. Healthcare's "hospital-list") represents a base entity
   * listing, not a per-row value. It is only ever meaningful as the
   * PRIMARY metric (metrics[0] - "hospitals in Birmingham with their
   * overall ratings", where the listing stays primary and "overall
   * ratings" is Phase 7's secondary, per-row enrichment). When some
   * OTHER, genuinely analytical metric resolves first instead (e.g.
   * "safest hospitals in Texas" - "safest" is metrics[0], "hospitals
   * in" would otherwise be metrics[1]), this capability-less metric has
   * no per-row value for Phase 7 to fetch and merge as a secondary
   * enrichment - it has no template for that role - and would silently
   * disappear from the plan if simply dropped, exactly the shape
   * `assessPlanCompleteness()` exists to catch. Removing it HERE, at
   * the same layer as `filterMetricsForIntent()`/`filterFallbackMetrics()`
   * above, keeps it a legitimate, accounted-for removal (`plannedSemantic.
   * metrics` - what `assessPlanCompleteness()` treats as already-filtered)
   * rather than a candidate lost after planning. Domain-agnostic: reuses
   * the same "any analytical capability" flags `filterMetricsForIntent()`
   * already reads, and only ever removes a non-primary candidate - a
   * standalone capability-less metric (the common "hospitals in Texas"
   * case) is completely unaffected, since it stays metrics[0].
   */
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
   * Tier0 Task 5 (F12 Sub-Task A): discovers the active Domain SDK's
   * declared default ranking metric (see MetricDefinition.defaultRankable)
   * for a request that names at least one scope-filter entity (e.g.
   * state, ownership) but no metric at all. Domain-agnostic: only ever
   * consumes the generic `defaultRankable` flag and
   * `EntityDefinition.identifiesUniqueRecord`, never a domain-specific
   * entity id or metric id.
   *
   * Deliberately excludes a request naming an entity that identifies a
   * single, specific record (e.g. a named hospital) - defaulting THAT
   * to a nationwide ranking would silently reinterpret "tell me about
   * Mayo Clinic" as "rank hospitals nationwide", dropping the named
   * identity entirely - exactly the entity-drop shape Tier0 Task 2 (F8)
   * already closed elsewhere. Only fires when every resolved entity is
   * a scope-only filter.
   *
   * Bug E (Phase 3.1, 2026-09-18): also refuses when the original
   * question contains a substantive word that never became part of ANY
   * resolved semantic candidate at all (see
   * `hasUnaccountedSubstantiveToken()`'s own doc comment) - e.g.
   * "what's the weather in Texas?" resolves only the "Texas" state
   * entity, and "weather" is never accounted for anywhere. Defaulting a
   * nationwide hospital ranking onto the resolved entity alone in that
   * case would silently fabricate an answer to a different, narrower
   * question than the one actually asked - the single most severe
   * no-fabrication-invariant violation found in this codebase's history
   * (Round 6 audit, Bug E).
   */
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
  /**
   * Bug E (Phase 3.1, 2026-09-18): true when the original question
   * contains a word that never became part of ANY resolved semantic
   * candidate's own matched phrase - metric, entity, dimension,
   * category, benchmark, or relationship, whichever domain supplied
   * them - and is not one of the generic English question/filler words
   * above. This is a purely structural check: it only ever compares the
   * raw question text against phrases the semantic pipeline itself
   * already resolved, never a hardcoded off-topic vocabulary (no
   * "weather", "climate", "president" anywhere in this file) - the same
   * mechanism would refuse "what's the [x] in Texas?" for ANY word `x`
   * this Domain SDK's own registered vocabulary doesn't recognize,
   * regardless of what that word is.
   *
   * Also treats a word as accounted for when it equals a REGISTERED
   * entity's own `id` (`domainEntities`, the domain's complete entity
   * list - not just the entities that happened to resolve as
   * candidates this query). Confirmed necessary live: a word naming the
   * domain's own core subject (e.g. Healthcare's "hospital" entity,
   * `id: "hospital"`) does not always land inside a matched alias
   * phrase - "CA government hospital"/"government hospital TX" (word
   * order variants with no "hospital(s) in" 2-gram to match) would
   * otherwise flag "hospital" itself as an unaccounted, off-topic-
   * looking word and wrongly refuse a legitimate query. This stays
   * domain-agnostic: Universal Core never names "hospital" itself, it
   * only ever compares against whatever `id`s the active Domain SDK
   * already declared, the same way `domainMetrics` is already consumed
   * generically elsewhere in this file.
   */
  hasUnaccountedSubstantiveToken(normalizedQuery, allMatches, domainEntities) {
    return this.unaccountedWords(normalizedQuery, allMatches, domainEntities).length > 0;
  }
  /**
   * True when the deterministic layers understood EVERY word of the question:
   * each word is part of a resolved semantic phrase, a registered entity id, a
   * generic filler/function word, or a word the intent detector acts on
   * (ranking / comparison / trend / aggregation). A typo ("Houson"), an
   * unregistered word ("heart pain", "weather") or a lowercase state code
   * ("oh") is left over, so it returns false. The runtime engine uses this to
   * skip an LLM rewrite that could only change a question it already
   * understood - a suggestion chip, a canonical question, an aliased phrase.
   * Structural and domain-agnostic, like hasUnaccountedSubstantiveToken().
   */
  isFullyUnderstood(normalizedQuery, allMatches, domainEntities) {
    return this.unaccountedWords(normalizedQuery, allMatches, domainEntities, (word) => FUNCTION_WORDS.has(word) || INTENT_KEYWORDS.has(word)).length === 0;
  }
  /**
   * Batch 1 (Step 1.2): the words of `normalizedQuery` that nothing resolved,
   * with the same allowance isFullyUnderstood() applies (question-filler,
   * function and intent words count as understood). When `originalQuestion`
   * is given, only words the user actually typed are returned: an LLM rewrite
   * can introduce words of its own (a concept's display name, "performance")
   * that no alias registers, and those are harmless - a word the user typed,
   * that survived the rewrite and that nothing resolved is a dropped
   * constraint. Structural and domain-agnostic: never inspects what a word
   * means, only whether some semantic candidate accounted for it.
   */
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
    return words.filter((word) => typed.has(word));
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
      (word) => !consumedWords.has(word) && !QUESTION_FILLER_WORDS.has(word) && !alsoIgnore(word)
    );
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
        direction: this.performanceDirection(candidate) ?? "desc"
      });
    }
    return metrics;
  }
  /**
   * Batch 3 (D1): the direction a ranking modifier asks for, normalized to ONE convention that every domain
   * template can rely on: "desc" = best first, "asc" = worst first.
   *
   * The semantic layer reports the modifier's bucket (highest/best/top/largest -> "desc", lowest/worst/bottom/
   * smallest -> "asc") and which kind of word it was. A performance word ("best", "worst") already says which end
   * is good, so its bucket already is best-first / worst-first. A magnitude word ("highest", "lowest") names the
   * number: for a metric where higher is better that is the same thing, but for a metric where LOWER is better
   * (`MetricDefinition.lowerIsBetter`) "highest" means the worst hospitals first, so the bucket flips.
   * A candidate with no modifier keeps the default of the caller.
   */
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
  /**
   * Batch 3 (D1): which side of a benchmark the request asks for, normalized to the same convention as the ranking
   * direction: "above" = the better side, "below" = the worse side (a benchmark template compares PERFORMANCE).
   * A comparison that judges the result ("performing below", "beat", "worse than", "better than") already says so.
   * A bare "below" / "lower than" / "above" names the number: for a metric where LOWER is better
   * (`MetricDefinition.lowerIsBetter`), "mortality rate lower than the national average" asks for the BETTER
   * hospitals, so the side flips. Without a comparison word, or for a higher-is-better metric, nothing changes.
   */
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
  ExecutionPlanMapper,
  INTENT_KEYWORDS,
  QueryIntentDetector,
  QueryPlanner,
  SemanticCollector,
  assessPlanCompleteness,
  detectSubsumedBenchmarkRisk,
  hasRelationshipWithoutBenchmark
};
