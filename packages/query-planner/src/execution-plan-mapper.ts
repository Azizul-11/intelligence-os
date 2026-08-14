import type {
  ExecutionPlan,
  ExecutionOperation,
  ExecutionFilter,
  ExecutionOrdering,
  ExecutionGrouping,
  ExecutionLimit,
} from "@intelligence/contracts";

import type { QueryPlan } from "./query-plan";
import type { QueryIntent } from "./query-intent";
import type { EntityDefinition } from "@intelligence/domain-sdk";

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
    const ordering = this.buildOrdering(queryPlan, operation);
    const limit = this.buildLimit(queryPlan);

    const plan: ExecutionPlan = {
      operation,
      metric: primaryMetric,
      filters,
      parameters: queryPlan.parameters,
    };

    if (grouping !== undefined) {
      plan.grouping = grouping;
    }

    if (ordering !== undefined) {
      plan.ordering = ordering;
    }

    if (limit !== undefined) {
      plan.limit = limit;
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
   */
  private buildFilters(queryPlan: QueryPlan): ExecutionFilter[] {
    const filters: ExecutionFilter[] = [];

    // Convert entity parameters to filters
    for (const entity of queryPlan.semantic.entities) {
      const definition = entity.definition as EntityDefinition;

      if (!definition.execution) {
        continue;
      }

      const parameterName = definition.execution.parameter;
      const resolvedValue = entity.resolvedValue ?? entity.phrase;

      filters.push({
        field: parameterName,
        operator: "=",
        value: resolvedValue as string | number | boolean,
      });
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
      const primaryMetric = queryPlan.semantic.metrics[0]?.canonicalKey;

      if (!primaryMetric) {
        return undefined;
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
}
