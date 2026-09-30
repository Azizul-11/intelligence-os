/** Maps a semantic QueryPlan into a deterministic Universal ExecutionPlan (operation, filters, ordering, limit, benchmark). Domain-agnostic. */
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
import type { EntityDefinition, ConceptDefinition, MetricDefinition } from "@intelligence/domain-sdk";
import type { SemanticCandidate } from "@intelligence/semantic";
import { groupEntityValues } from "./group-entity-values";

/** Batch 3 (D1): words that make a comparison judge the RESULT ("beat", "better than") rather than the NUMBER ("above", "lower than"). Domain-agnostic. */
const PERFORMANCE_COMPARISON_WORDS = new Set([
  "performing",
  "outperform",
  "outperforms",
  "outperforming",
  "underperforming",
  "beat",
  "beats",
  "beating",
  "better",
  "worse",
]);

export class ExecutionPlanMapper {
  map(queryPlan: QueryPlan): ExecutionPlan {
    const primaryMetric = this.extractPrimaryMetric(queryPlan);
    const operation = this.mapIntent(queryPlan.intent);
    const filters = this.buildFilters(queryPlan);
    const grouping = this.buildGrouping(queryPlan);
    const metrics = this.buildMetrics(queryPlan);

    // Phase 6: a single `ordering` field can't represent more than one metric's direction, so it's omitted for multi-metric plans rather than populated with only the primary's.
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

  /** Distinct metrics carried by this plan, each with its own ranking direction. Deduplicates by canonicalKey - exhaustive phrase extraction can match the same metric via more than one phrase. */
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
        direction: this.performanceDirection(candidate) ?? "desc",
      });
    }

    return metrics;
  }

  /** Batch 3: normalizes ranking direction to "desc"=best first, "asc"=worst first - flips for a lower-is-better metric. */
  private performanceDirection(candidate: SemanticCandidate): "asc" | "desc" | undefined {
    const direction = candidate.direction;

    if (!direction) {
      return undefined;
    }

    const lowerIsBetter = (candidate.definition as MetricDefinition).lowerIsBetter === true;

    if (lowerIsBetter && candidate.directionBasis === "magnitude") {
      return direction === "desc" ? "asc" : "desc";
    }

    return direction;
  }

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

  /** Phase 7.5.3: entities sharing the same execution parameter are grouped into one "in" filter, not one "=" filter each. */
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

    // Tier0 Task 5: a concept's `measureCodesByMetric` match becomes a `measureCode` filter; no match stays
    // "unaccounted for" and is caught by the Phase 8.8 completeness gate.
    for (const concept of queryPlan.semantic.concepts) {
      const definition = concept.definition as ConceptDefinition;
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
            value: measureCode,
          });
        }
      }
    }

    return filters;
  }

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

  /** Ranking operations order by primary metric descending by default; other operations may not need ordering. */
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

      // RCG-019: prefers the direction already resolved from a ranking modifier (same signal buildMetrics() uses) over the relationship-based fallback below.
      const requestedDirection = this.performanceDirection(primaryCandidate);

      if (requestedDirection) {
        return {
          field: primaryMetric,
          direction: requestedDirection,
        };
      }

      // Default descending (best first); a "below" comparison means worst first, so ascending.
      const direction: "asc" | "desc" = this.performanceComparison(queryPlan) === "below" ? "asc" : "desc";

      return {
        field: primaryMetric,
        direction,
      };
    }

    // Other operations don't automatically get ordering
    return undefined;
  }

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

  /** Batch 3: normalizes to "above"=better, "below"=worse - flips a bare number-comparison for a lower-is-better metric. */
  private performanceComparison(queryPlan: QueryPlan): "above" | "below" | undefined {
    const { relationships, metrics } = queryPlan.semantic;
    const below = relationships.find((r) => r.canonicalKey === "below-comparison");
    const stated = below ?? relationships.find((r) => r.canonicalKey === "above-comparison");

    if (!stated) {
      return undefined;
    }

    const comparison: "above" | "below" = below ? "below" : "above";
    const lowerIsBetter = (metrics[0]?.definition as MetricDefinition | undefined)?.lowerIsBetter === true;
    const judgesResult = stated.phrase.split(" ").some((word) => PERFORMANCE_COMPARISON_WORDS.has(word));

    if (lowerIsBetter && !judgesResult) {
      return comparison === "below" ? "above" : "below";
    }

    return comparison;
  }

  /** RCG-009: requires both a relationship and benchmark candidate; the longer, more specific benchmark match wins. */
  private buildBenchmark(
    queryPlan: QueryPlan,
  ): ExecutionBenchmark | undefined {
    const { relationships, benchmarks } = queryPlan.semantic;

    if (relationships.length === 0 || benchmarks.length === 0) {
      return undefined;
    }

    const comparison = this.performanceComparison(queryPlan);

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
