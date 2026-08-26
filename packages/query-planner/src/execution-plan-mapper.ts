import type {
  ExecutionPlan,
  ExecutionOperation,
  ExecutionFilter,
  ExecutionOrdering,
  ExecutionGrouping,
  ExecutionLimit,
  ExecutionPlanMetric,
  ExecutionBenchmark,
} from "@intelligence/contracts";

import type { QueryPlan } from "./query-plan";
import type { QueryIntent } from "./query-intent";
import type { EntityDefinition } from "@intelligence/domain-sdk";
import { groupEntityValues } from "./group-entity-values";

/**
 * ExecutionPlanMapper
 *
 * Phase 5.2: Maps semantic QueryPlan to Universal ExecutionPlan.
 *
 * Converts Phase 4 semantic understanding into Phase 5 deterministic
 * execution structure.
 *
 * Universal mapping logic - no Healthcare-specific knowledge.
 */
export class ExecutionPlanMapper {
  /**
   * Map QueryPlan to ExecutionPlan.
   *
   * Converts semantic collections and intent into execution structure.
   */
  map(queryPlan: QueryPlan): ExecutionPlan {
    const primaryMetric = this.extractPrimaryMetric(queryPlan);
    const operation = this.mapIntent(queryPlan.intent);
    const filters = this.buildFilters(queryPlan);
    const grouping = this.buildGrouping(queryPlan);
    const metrics = this.buildMetrics(queryPlan);

    // Phase 6: a single global `ordering` field cannot correctly represent
    // more than one metric's independent direction. When the plan carries
    // more than one distinct metric, ordering is omitted here rather than
    // populated with only the primary metric's direction, so a future
    // consumer cannot mistake it for the whole compound ordering. Existing
    // single-metric behavior (the common case today) is unchanged.
    const isMultiMetric = metrics.length > 1;
    const ordering = isMultiMetric
      ? undefined
      : this.buildOrdering(queryPlan, operation);

    const limit = this.buildLimit(queryPlan);
    const benchmark = this.buildBenchmark(queryPlan);

    const plan: ExecutionPlan = {
      operation,
      metric: primaryMetric,
      filters,
      parameters: queryPlan.parameters,
    };

    if (isMultiMetric) {
      plan.metrics = metrics;
    }

    if (grouping !== undefined) {
      plan.grouping = grouping;
    }

    if (ordering !== undefined) {
      plan.ordering = ordering;
    }

    if (limit !== undefined) {
      plan.limit = limit;
    }

    if (benchmark !== undefined) {
      plan.benchmark = benchmark;
    }

    return plan;
  }

  /**
   * Extract primary metric from semantic collections.
   */
  private extractPrimaryMetric(queryPlan: QueryPlan): string {
    if (queryPlan.semantic.metrics.length === 0) {
      throw new Error("ExecutionPlan requires at least one metric");
    }

    const primaryMetric = queryPlan.semantic.metrics[0];

    if (!primaryMetric) {
      throw new Error("ExecutionPlan requires at least one metric");
    }

    // Use first metric as primary
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
  private buildMetrics(queryPlan: QueryPlan): ExecutionPlanMetric[] {
    const seen = new Set<string>();
    const metrics: ExecutionPlanMetric[] = [];

    for (const candidate of queryPlan.semantic.metrics) {
      if (seen.has(candidate.canonicalKey)) {
        continue;
      }

      seen.add(candidate.canonicalKey);

      metrics.push({
        metric: candidate.canonicalKey,
        direction: candidate.direction ?? "desc",
      });
    }

    return metrics;
  }

  /**
   * Map QueryIntent to ExecutionOperation.
   */
  private mapIntent(intent: QueryIntent): ExecutionOperation {
    const mapping: Record<QueryIntent, ExecutionOperation> = {
      lookup: "lookup",
      ranking: "rank",
      comparison: "compare",
      trend: "analyze",
      aggregation: "aggregate",
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
  private buildFilters(queryPlan: QueryPlan): ExecutionFilter[] {
    const entries: { key: string; value: string | number | boolean }[] = [];

    // Convert entity parameters to filter entries
    for (const entity of queryPlan.semantic.entities) {
      const definition = entity.definition as EntityDefinition;

      if (!definition.execution) {
        continue;
      }

      const resolvedValue = entity.resolvedValue ?? entity.phrase;

      entries.push({
        key: definition.execution.parameter,
        value: resolvedValue as string | number | boolean,
      });
    }

    const filters: ExecutionFilter[] = [];

    for (const [field, values] of groupEntityValues(entries)) {
      if (values.length === 1) {
        filters.push({
          field,
          operator: "=",
          value: values[0]!,
        });
      } else {
        filters.push({
          field,
          operator: "in",
          value: values as string[] | number[],
        });
      }
    }

    return filters;
  }

  /**
   * Build grouping from semantic dimensions.
   */
  private buildGrouping(
    queryPlan: QueryPlan,
  ): ExecutionGrouping | undefined {
    if (queryPlan.semantic.dimensions.length === 0) {
      return undefined;
    }

    return {
      dimensions: queryPlan.semantic.dimensions.map((d) => d.canonicalKey),
    };
  }

  /**
   * Build ordering based on operation and metrics.
   *
   * Ranking operations order by primary metric descending.
   * Other operations may not require ordering.
   */
  private buildOrdering(
    queryPlan: QueryPlan,
    operation: ExecutionOperation,
  ): ExecutionOrdering | undefined {
    if (operation === "rank") {
      const primaryCandidate = queryPlan.semantic.metrics[0];
      const primaryMetric = primaryCandidate?.canonicalKey;

      if (!primaryMetric) {
        return undefined;
      }

      // RCG-019: prefer the direction already resolved from a ranking
      // modifier ("highest"/"lowest"/...) - the same generic signal
      // buildMetrics() below already consumes for the multi-metric case
      // (Phase 6.2, SemanticCandidate.direction). This was previously
      // never read here at all, so a query's actually-requested
      // direction never reached ExecutionPlan.ordering; only the
      // relationship-based fallback below ran, which only ever flips
      // direction when a "below"-style relationship candidate is also
      // present (a separate, unrelated signal - see RCG-009).
      if (primaryCandidate.direction) {
        return {
          field: primaryMetric,
          direction: primaryCandidate.direction,
        };
      }

      // Determine direction from relationships if present
      const hasAbove = queryPlan.semantic.relationships.some(
        (r) => r.canonicalKey === "above-comparison",
      );
      const hasBelow = queryPlan.semantic.relationships.some(
        (r) => r.canonicalKey === "below-comparison",
      );

      // Default to descending for rankings (highest/best first)
      let direction: "asc" | "desc" = "desc";

      // If query explicitly asks for "lowest" or "below", use ascending
      if (hasBelow) {
        direction = "asc";
      }

      return {
        field: primaryMetric,
        direction,
      };
    }

    // Other operations don't automatically get ordering
    return undefined;
  }

  /**
   * Build execution limit.
   *
   * Apply default limit for operations that typically need them.
   */
  private buildLimit(queryPlan: QueryPlan): ExecutionLimit | undefined {
    // Ranking and lookup operations typically need limits
    if (queryPlan.intent === "ranking" || queryPlan.intent === "lookup") {
      return {
        value: 10, // Default limit
        offset: 0,
      };
    }

    // Aggregation might not need limit
    if (queryPlan.intent === "aggregation") {
      // Check if there are dimensions - if so, might want a limit
      if (queryPlan.semantic.dimensions.length > 0) {
        return {
          value: 100, // Higher limit for grouped aggregations
          offset: 0,
        };
      }
    }

    return undefined;
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
  private buildBenchmark(
    queryPlan: QueryPlan,
  ): ExecutionBenchmark | undefined {
    const { relationships, benchmarks } = queryPlan.semantic;

    if (relationships.length === 0 || benchmarks.length === 0) {
      return undefined;
    }

    const comparison: "above" | "below" | undefined = relationships.some(
      (r) => r.canonicalKey === "below-comparison",
    )
      ? "below"
      : relationships.some((r) => r.canonicalKey === "above-comparison")
        ? "above"
        : undefined;

    if (!comparison) {
      return undefined;
    }

    const primaryBenchmark = [...benchmarks].sort(
      (a, b) => (b.end - b.start) - (a.end - a.start),
    )[0]!;

    return {
      benchmark: primaryBenchmark.canonicalKey,
      comparison,
    };
  }
}
