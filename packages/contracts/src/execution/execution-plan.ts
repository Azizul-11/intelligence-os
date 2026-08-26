import type { ExecutionOperation } from "./execution-operation";
import type { ExecutionFilter } from "./execution-filter";
import type { ExecutionOrdering } from "./execution-ordering";
import type { ExecutionGrouping } from "./execution-grouping";
import type { ExecutionLimit } from "./execution-limit";
import type { ExecutionPlanMetric } from "./execution-plan-metric";
import type { ExecutionBenchmark } from "./execution-benchmark";

/**
 * Universal Execution Plan.
 *
 * Represents a deterministic execution structure independent of:
 * - Semantic resolution details
 * - SQL generation
 * - Domain-specific logic
 * - Implementation details
 *
 * This contract bridges semantic meaning to execution, defining WHAT to execute
 * without specifying HOW to execute it.
 *
 * Phase 5.1 establishes this contract.
 * Phase 5.2 will build the semantic → execution plan mapping.
 * Phase 5.3 will prove end-to-end execution.
 * Phase 6 adds optional multi-metric support (see `metrics`) without
 * replacing the single-metric shape - existing single-metric consumers
 * are unaffected.
 */
export interface ExecutionPlan {
  /**
   * High-level operation to perform.
   */
  operation: ExecutionOperation;

  /**
   * Primary metric to compute or analyze.
   * Canonical metric identifier from the domain registry.
   *
   * Always the first distinct metric found, preserved for backward
   * compatibility. When the plan represents more than one metric, see
   * `metrics` for the full set - this field is not replaced or removed.
   */
  metric: string;

  /**
   * Full set of distinct metrics and their independent ranking
   * directions, when the plan represents more than one metric.
   *
   * Omitted entirely for single-metric plans - existing consumers that
   * only read `metric` see no change in shape or behavior.
   *
   * Phase 6 (planning only): describes WHAT the multiple criteria are.
   * Phase 7 owns HOW they are executed and combined.
   */
  metrics?: ExecutionPlanMetric[];

  /**
   * Filters to apply during execution.
   */
  filters: ExecutionFilter[];

  /**
   * Grouping/aggregation dimensions.
   * Optional - not all operations require grouping.
   */
  grouping?: ExecutionGrouping;

  /**
   * Result ordering specification.
   * Optional - not all operations require ordering.
   */
  ordering?: ExecutionOrdering;

  /**
   * Result limit and pagination.
   * Optional - defaults may be applied by execution layer.
   */
  limit?: ExecutionLimit;

  /**
   * Additional execution parameters.
   * Domain-specific values needed for execution (e.g., resolved entity IDs).
   */
  parameters?: Record<string, unknown>;

  /**
   * RCG-009: a comparison against a domain-defined benchmark reference
   * value (e.g. "above the national average"). Optional - opaque to
   * Universal Core, see ExecutionBenchmark.
   */
  benchmark?: ExecutionBenchmark;
}
