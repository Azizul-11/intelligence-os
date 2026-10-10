/** Turns resolved semantic candidates into a QueryPlan: picks intent, discovers a metric when none was named, and filters candidates that don't fit the intent. */
import type { SemanticResolutionResult, SemanticCandidate } from "@intelligence/semantic";
import { Normalizer } from "@intelligence/semantic";
import type { MetricDefinition, EntityDefinition } from "@intelligence/domain-sdk";

import { INTENT_KEYWORDS, QueryIntentDetector } from "./query-intent-detector";

import type { QueryPlanResult } from "./query-plan-result";
import type { QueryIntent } from "./query-intent";
import { SemanticCollector } from "./semantic-collector";

import { EntityParameterResolver } from "./entity-parameter-resolver";
import { COUNT_WORDS, requestedCount } from "./requested-count";

/** Bug E: generic English filler words, so hasUnaccountedSubstantiveToken() doesn't false-positive on ordinary phrasing. Domain-agnostic. */
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

/** A second, separate filler set used only by isFullyUnderstood() - kept apart so widening it can't loosen Bug E's refusal. */
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
  // Batch 3: "rated" ("highest rated hospitals") is consumed into its metric by lexical rewrite, so it carries no constraint of its own.
  "rated",
]);

export class QueryPlanner {
  /** Batch 5A-1: filler words the domain declares as data, read like QUESTION_FILLER_WORDS. */
  private readonly domainFillerWords: ReadonlySet<string>;

  constructor(options: { fillerWords?: readonly string[] } = {}) {
    this.domainFillerWords = new Set((options.fillerWords ?? []).map((word) => word.toLowerCase()));
  }

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
    // RCG-010: a direction contradiction gets a specific message, not the generic failure.
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

    // Fix Cycle 018: 2+ entities with NO metric ("Compare Mayo Clinic and Cleveland Clinic") gets the domain's
    // comparable metrics instead of being rejected outright.
    let discoveredComparableMetrics = false;
    let discoveredDefaultRanking = false;

    // Round 3: a non-rankable-only metric counts as metric-less for default-ranking purposes, but never for a bare
    // geographic list ("hospitals in Texas") - distinguished by a non-geographic-scope entity being present.
    const hasOnlyNonRankableMetrics =
      collections.metrics.length > 0 &&
      collections.metrics.every(
        (metric) => (metric.definition as MetricDefinition).rankable === false,
      );
    const hasNonGeographicScopeEntity = collections.entities.some(
      (entity) => (entity.definition as EntityDefinition).category?.isGeographicScope !== true,
    );

    // Bug A/C: skip default discovery for a unique-record entity or a bare entity with no metric -
    // the F8 plan-ambiguity gate handles those instead.
    const hasUniqueRecordEntity = collections.entities.some(
      (entity) => (entity.definition as EntityDefinition).identifiesUniqueRecord === true,
    );

    // Runs FIRST, not gated by `hasUniqueRecordEntity`: 2+ named hospitals IS the shape this discovers for.
    // Gating on it once silently disabled every hospital-vs-hospital comparison with no named metric.
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

    // Tier0 Task 5: a scope filter with no metric ("non-profit hospitals") gets the domain's default ranking
    // metric instead of a rejection. Never with a unique-record entity present (that needs its own detail lookup).
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

    // Bug A/C: a bare unique-record entity ("ADVENTHEALTH GORDON") needs a lookup metric - injects a default
    // "<entity>-detail" metric, skipped when `forcedIntent` preserves Turn 1 context instead.
    if (
      collections.metrics.length === 0 &&
      hasUniqueRecordEntity &&
      collections.entities.length > 0 &&
      !forcedIntent
    ) {
      // The record itself, not whichever entity came first: a pinned identity is appended after an attribute ("birth friendly").
      const firstEntity =
        collections.entities.find((entity) => (entity.definition as EntityDefinition).identifiesUniqueRecord === true) ??
        collections.entities[0];
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

    // Discovery above already establishes comparison intent - keyword detection isn't reliable here (Fix Cycle 018).
    // Tier0 Task 6: a caller that already knows the answer shape (e.g. a Layer 2 continuation) may pass `forcedIntent` to skip keyword detection.
    let intent: QueryIntent = forcedIntent
      ? forcedIntent
      : discoveredComparableMetrics
        ? "comparison"
        : discoveredDefaultRanking
          ? "ranking"
          : this.intentDetector.detect(
              semantic.originalQuery,
            );

    // RCG-009b: "average" alone triggers aggregation, but "above average" is a comparison - `relationship` is the
    // signal that distinguishes them. Reclassified to "ranking" (Healthcare's "lookup" is single-entity only).
    if (
      (intent === "aggregation" && collections.relationships.length > 0) ||
      (intent === "lookup" && collections.relationships.length > 0 && collections.benchmarks.length > 0)
    ) {
      intent = "ranking";
    }

    // Disambiguates metric candidates against the detected intent using each metric's own capability metadata.
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

  /** Maps a detected intent to the MetricDefinition capability flag it requires - "ranking" needs rankable, etc. */
  private static readonly INTENT_CAPABILITY_FLAG: Partial<
    Record<QueryIntent, keyof MetricDefinition>
  > = {
    ranking: "rankable",
    aggregation: "aggregatable",
  };

  /** Drops metric candidates that disagree with the intent's required capability, when another candidate agrees - resolves alias collisions. Never empties the list. */
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
      // "lookup" (and any intent with no capability mapping) is left unfiltered - see the doc comment above.
      return metrics;
    }

    if (capable.length === 0 || capable.length === metrics.length) {
      return metrics;
    }

    return capable;
  }

  /** Suppresses a fallback-idiom metric candidate (e.g. "best <entities>") when an explicitly-typed one is also present. */
  private filterFallbackMetrics(
    metrics: SemanticCandidate[],
  ): SemanticCandidate[] {
    const explicit = metrics.filter((metric) => !metric.isFallback);

    if (explicit.length === 0 || explicit.length === metrics.length) {
      return metrics;
    }

    return explicit;
  }

  /** Bug F: a capability-less metric (e.g. "hospital-list") only makes sense as the PRIMARY metric - drops it when it's a non-primary secondary instead, so it's an accounted-for removal, not a silent vanish. */
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

  /** Fix Cycle 018: synthesizes metric candidates for a metric-less multi-entity request from the domain's `comparable` metrics. Requires 2+ entities sharing an execution parameter. */
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

  /** Tier0 Task 5 (F12): discovers the default ranking metric for a scope-only request. Skips a unique-record entity, and (Bug E) any question with an unresolved substantive word. */
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

  /** Bug E: true when the question has a word nothing accounted for, not counting fillers. Also counts a bare entity id like "hospital". */
  private hasUnaccountedSubstantiveToken(
    normalizedQuery: string,
    allMatches: readonly SemanticCandidate[],
    domainEntities: readonly EntityDefinition[],
  ): boolean {
    return this.unaccountedWords(normalizedQuery, allMatches, domainEntities).length > 0;
  }

  /** True when every word of the question is resolved, a registered entity id, filler, or an intent keyword - a typo or unregistered word returns false. Lets the runtime skip an LLM rewrite on an already-understood question. */
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

  /** Batch 1: unresolved words of `normalizedQuery`. With `originalQuestion`, only user-typed words that survived a rewrite count (a rewrite-introduced word is harmless). Count/ordering words ("top 5", "lowest first") are exempt. */
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
    const count = requestedCount(originalQuestion);
    const isRequestedLimitToken = (word: string): boolean => count !== undefined && (word === String(count) || COUNT_WORDS[word] === count);
    const isOrderingFirst = (word: string): boolean => word === "first" && /\b(?:highest|lowest|best|worst)\s+first\b/.test(normalizedQuery);

    return words.filter((word) => typed.has(word) && !isRequestedLimitToken(word) && !isOrderingFirst(word));
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
      consumedWords.add(`${id}s`); // naive English plural, so "hospitals" is accounted for like "hospital"
    }

    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

    return queryWords.filter(
      (word) => !consumedWords.has(word) && !QUESTION_FILLER_WORDS.has(word) && !this.domainFillerWords.has(word) && !alsoIgnore(word),
    );
  }

  /** True when 2+ resolved entities share the same execution parameter (Phase 7.5.3's multi-entity "in"-filter signal). */
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