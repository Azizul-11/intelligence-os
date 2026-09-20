import type { SemanticResolutionResult, SemanticCandidate } from "@intelligence/semantic";
import { Normalizer } from "@intelligence/semantic";
import type { MetricDefinition, EntityDefinition } from "@intelligence/domain-sdk";

import { INTENT_KEYWORDS, QueryIntentDetector } from "./query-intent-detector";

import type { QueryPlanResult } from "./query-plan-result";
import type { QueryIntent } from "./query-intent";
import { SemanticCollector } from "./semantic-collector";

import { EntityParameterResolver } from "./entity-parameter-resolver";

/**
 * Bug E (Phase 3.1, 2026-09-18): a small, generic set of English
 * question/command/filler words with no topical meaning of their own -
 * distinct from, and never merged with, `packages/semantic`'s own
 * `STOPWORDS` (a narrower set serving an unrelated purpose - role-
 * tagging tokens for negation/modifier detection - not safe to widen
 * without auditing its other consumers). This set exists ONLY to keep
 * `hasUnaccountedSubstantiveToken()` from false-positiving on ordinary
 * conversational phrasing ("show me...", "what is...", "tell me
 * about...") that carries no domain-specific or off-topic content by
 * itself. Deliberately domain-agnostic: contains no healthcare
 * vocabulary and no off-topic vocabulary (no "weather", "climate",
 * "president", etc.) - it only describes the shape of an ordinary
 * English question, reusable by any future Domain SDK unchanged.
 */
const QUESTION_FILLER_WORDS = new Set([
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
  "or",
]);

/**
 * Plain English function words that carry no topic - a SECOND, separate set,
 * used only by `isFullyUnderstood()`. It is kept apart from
 * QUESTION_FILLER_WORDS on purpose: widening that one would loosen Bug E's
 * off-topic refusal, which must stay exactly as it is.
 */
const FUNCTION_WORDS = new Set([
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
  "rated",
]);

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
    forcedIntent?: QueryIntent,
    domainEntities: readonly EntityDefinition[] = [],
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
    let discoveredDefaultRanking = false;

    // PrePhase 9.5 Round 3: a request whose ONLY resolved metric is
    // non-rankable (e.g. Healthcare's "hospital-list", matched by the
    // phrase "hospitals in") is, for default-ranking-discovery purposes,
    // exactly as metric-less as a request with zero metrics at all - a
    // non-rankable metric never determines the query's own output
    // shape, it merely happens to be the phrase that resolved. But this
    // must NOT fire for a bare geographic list request ("hospitals in
    // Texas", "hospitals in Birmingham Alabama") - Healthcare's own
    // list-by-state/geographic-list capability is a real, intended
    // answer shape, not a degraded default. The distinguishing, still
    // domain-agnostic signal: at least one resolved entity whose
    // category is NOT flagged `isGeographicScope` (e.g. an ownership
    // filter) - a pure geographic request has none, so it is
    // unaffected; "non-profit hospitals in California" does, so it
    // becomes eligible for the same default-ranking discovery a bare
    // "non-profit hospitals" (no state at all) already receives below,
    // instead of silently returning the state's own already-oversized
    // full list capped only by Tier1 Task 5's generic ceiling.
    const hasOnlyNonRankableMetrics =
      collections.metrics.length > 0 &&
      collections.metrics.every(
        (metric) => (metric.definition as MetricDefinition).rankable === false,
      );
    const hasNonGeographicScopeEntity = collections.entities.some(
      (entity) => (entity.definition as EntityDefinition).category?.isGeographicScope !== true,
    );

    // Bug A/C fix: Skip default metric discovery when any entity identifies
    // a unique record (e.g. a named hospital). The discovery logic below
    // already checks this internally via discoverDefaultRankableMetric(),
    // but by then we've already committed to "no metric, discover one",
    // causing hard failure when discovery refuses. For queries with a non-
    // rankable metric already resolved (hospital-detail), skip discovery to
    // preserve that metric. For bare entity queries with NO metric at all,
    // also skip discovery - they'll be handled by the F8 plan-ambiguity gate
    // or fail with a proper semantic-incomplete reason, not discover a wrong
    // ranking metric.
    const hasUniqueRecordEntity = collections.entities.some(
      (entity) => (entity.definition as EntityDefinition).identifiesUniqueRecord === true,
    );

    // Comparable-metric discovery runs FIRST, unconditionally whenever no
    // metric was named at all - deliberately NOT gated by
    // `hasUniqueRecordEntity` below: 2+ unique-record entities (e.g. two
    // named hospitals) is EXACTLY the shape this discovers a metric for
    // ("compare memorial hospital vs Mayo Clinic"). Gating this on
    // `!hasUniqueRecordEntity` (as an earlier revision of the Bug A/C fix
    // briefly did) silently disabled every hospital-vs-hospital comparison
    // with no named metric - discovered live 2026-09-15 debugging exactly
    // that regression (a comparison-continuation Turn 2 was completing as
    // a single-entity lookup, silently dropping the second hospital).
    if (collections.metrics.length === 0) {
      const discoveredComparable = this.discoverComparableMetrics(
        collections.entities,
        domainMetrics,
      );

      if (discoveredComparable.length > 0) {
        collections.metrics = discoveredComparable;
        discoveredComparableMetrics = true;
      }
    }

    // Tier0 Task 5 (F12 Sub-Task A): a request naming a scope filter
    // (e.g. "non-profit hospitals") but no metric at all is not rejected
    // outright the way a truly empty request is - it is offered the
    // active Domain SDK's own declared default ranking metric (see
    // MetricDefinition.defaultRankable). Only attempted when comparable-
    // metric discovery above didn't already resolve one, and (Bug A/C)
    // never when a unique-record entity is present - defaulting a RANKING
    // metric onto a specific named entity (a hospital dossier lookup, or
    // a bare unique-record mention) would silently substitute a
    // nationwide ranking for what should be that entity's own detail
    // lookup. A domain that declares no default ranking metric, or a
    // request with no scope entity at all, falls through to the original,
    // unchanged failure below.
    if (
      !discoveredComparableMetrics &&
      !hasUniqueRecordEntity &&
      (collections.metrics.length === 0 ||
        (hasOnlyNonRankableMetrics && hasNonGeographicScopeEntity))
    ) {
      const discoveredDefault = this.discoverDefaultRankableMetric(
        collections.entities,
        domainMetrics,
        semantic.normalizedQuery,
        semantic.matches,
        domainEntities,
      );

      if (discoveredDefault.length === 0) {
        return {
          success: false,
          plan: null,
        };
      }

      collections.metrics = discoveredDefault;
      discoveredDefaultRanking = true;
    }

    // Bug A/C remaining 5/12: Bare unique-record entity queries (e.g.
    // "ADVENTHEALTH GORDON" without "tell me about") have no metric
    // resolved and were correctly prevented from entering ranking-discovery
    // above, but still need a lookup metric to proceed. Inject a default
    // detail metric for the entity type. Domain-agnostic by construction:
    // searches for any non-rankable metric whose ID matches the entity's
    // own canonical key with "-detail" suffix pattern (e.g. hospital →
    // hospital-detail), a generic naming convention already established
    // by Phase 7.5.
    //
    // Comparison continuation fix: only inject when forcedIntent is NOT
    // provided - forcedIntent signals intentional preservation of Turn1
    // context (e.g. comparison intent from "compare memorial hospital vs
    // ANIMAS" → Turn2 "CARTHAGE" should stay comparison, not become bare
    // lookup). When forcedIntent is present, trust the caller's explicit
    // intent and skip metric injection.
    if (
      collections.metrics.length === 0 &&
      hasUniqueRecordEntity &&
      collections.entities.length > 0 &&
      !forcedIntent
    ) {
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
              isFallback: true,
            },
          ];
        }
      }
    }

    // Discovery above already establishes this is a comparison request
    // (2+ comparable entities, no metric named) - keyword-based intent
    // detection is not a reliable signal here (Fix Cycle 018 evidence:
    // "which is better" matches RANKING_KEYWORDS, "what are the
    // differences between" matches no keyword at all), so the intent is
    // set directly rather than inferred from the original text.
    //
    // Tier0 Task 6 (F8 own-choice extension): a caller that already knows
    // exactly what shape of answer this request must produce (e.g. a
    // Layer 2 continuation re-executing an already-disambiguated "own
    // rating" choice, where the original text's ranking word - "best" -
    // is no longer meaningful once a single entity is already pinned
    // down) may pass `forcedIntent` to skip keyword detection entirely.
    // Domain-agnostic: never inspects which metric/entity/domain is
    // involved, only overrides which of the fixed, Universal `QueryIntent`
    // values downstream planning uses.
    let intent: QueryIntent = forcedIntent
      ? forcedIntent
      : discoveredComparableMetrics
        ? "comparison"
        : discoveredDefaultRanking
          ? "ranking"
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
    //
    // Batch 3: the same holds when the reference value is worded without an
    // aggregation keyword ("above the national BENCHMARK for overall
    // rating"): the detector reads such a question as a plain "lookup",
    // which never reaches the benchmark template and answered a generic
    // ranking with the comparison silently dropped. A relationship AND a
    // benchmark together are the comparison signal, whatever the wording.
    if (
      (intent === "aggregation" && collections.relationships.length > 0) ||
      (intent === "lookup" && collections.relationships.length > 0 && collections.benchmarks.length > 0)
    ) {
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
      metrics: this.filterNonAnalyticalSecondaryMetrics(
        this.filterFallbackMetrics(
          this.filterMetricsForIntent(collections.metrics, intent),
        ),
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
    } else {
      // "lookup" (and any other intent with no capability mapping) is
      // left unfiltered - see this method's own doc comment above for
      // why the previous "lookup"-specific filtering branch was removed.
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
  private filterNonAnalyticalSecondaryMetrics(
    metrics: SemanticCandidate[],
  ): SemanticCandidate[] {
    if (metrics.length <= 1) {
      return metrics;
    }

    const [primary, ...rest] = metrics;
    const secondary = rest.filter((metric) => {
      const definition = metric.definition as MetricDefinition;
      const hasNoAnalyticalCapability =
        definition.rankable === false &&
        definition.aggregatable === false &&
        definition.benchmarkable === false;

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
  private discoverDefaultRankableMetric(
    entities: SemanticCandidate[],
    domainMetrics: readonly MetricDefinition[],
    normalizedQuery: string,
    allMatches: readonly SemanticCandidate[],
    domainEntities: readonly EntityDefinition[],
  ): SemanticCandidate[] {
    if (entities.length === 0) {
      return [];
    }

    const hasUniqueRecordEntity = entities.some(
      (entity) => (entity.definition as EntityDefinition).identifiesUniqueRecord === true,
    );

    if (hasUniqueRecordEntity) {
      return [];
    }

    if (this.hasUnaccountedSubstantiveToken(normalizedQuery, allMatches, domainEntities)) {
      return [];
    }

    const defaultMetric = domainMetrics.find(
      (metric) => metric.defaultRankable === true,
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
        isFallback: true,
      },
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
  private hasUnaccountedSubstantiveToken(
    normalizedQuery: string,
    allMatches: readonly SemanticCandidate[],
    domainEntities: readonly EntityDefinition[],
  ): boolean {
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
  isFullyUnderstood(
    normalizedQuery: string,
    allMatches: readonly SemanticCandidate[],
    domainEntities: readonly EntityDefinition[],
  ): boolean {
    return (
      this.unaccountedWords(normalizedQuery, allMatches, domainEntities, (word) => FUNCTION_WORDS.has(word) || INTENT_KEYWORDS.has(word))
        .length === 0
    );
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
  findUnaccountedWords(
    normalizedQuery: string,
    allMatches: readonly SemanticCandidate[],
    domainEntities: readonly EntityDefinition[],
    originalQuestion?: string,
  ): string[] {
    const words = this.unaccountedWords(
      normalizedQuery,
      allMatches,
      domainEntities,
      (word) => FUNCTION_WORDS.has(word) || INTENT_KEYWORDS.has(word),
    );

    if (originalQuestion === undefined) {
      return words;
    }

    const typed = new Set(new Normalizer().normalize(originalQuestion).split(" ").filter(Boolean));

    return words.filter((word) => typed.has(word));
  }

  private unaccountedWords(
    normalizedQuery: string,
    allMatches: readonly SemanticCandidate[],
    domainEntities: readonly EntityDefinition[],
    alsoIgnore: (word: string) => boolean = () => false,
  ): string[] {
    const consumedWords = new Set<string>();

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
      // Naive, generic English plural ("hospital" -> "hospitals") - not
      // a domain-specific rule, just regular pluralization morphology,
      // so a reordered phrasing using the plural form of the entity's
      // own id ("CA government hospitals") is accounted for the same
      // way the singular form already is.
      consumedWords.add(`${id}s`);
    }

    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

    return queryWords.filter(
      (word) => !consumedWords.has(word) && !QUESTION_FILLER_WORDS.has(word) && !alsoIgnore(word),
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