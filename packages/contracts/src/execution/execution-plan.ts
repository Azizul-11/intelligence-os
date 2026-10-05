import type { ExecutionOperation } from "./execution-operation";
import type { ExecutionFilter } from "./execution-filter";
import type { ExecutionOrdering } from "./execution-ordering";
import type { ExecutionGrouping } from "./execution-grouping";
import type { ExecutionLimit } from "./execution-limit";
import type { ExecutionPlanMetric } from "./execution-plan-metric";
import type { ExecutionBenchmark } from "./execution-benchmark";

/** Universal Execution Plan: defines WHAT to execute, independent of semantics, SQL and domain logic (Phase 5.1).
 * Phase 6 adds optional multi-metric support via `metrics`; single-metric consumers are unaffected. */
export interface ExecutionPlan {
  /** High-level operation to perform. */
  operation: ExecutionOperation;

  /** Primary metric (canonical id), always the first distinct one; see `metrics` for the full set. */
  metric: string;

  /** All distinct metrics with independent ranking directions; omitted for single-metric plans. Phase 6 plans WHAT, Phase 7 owns HOW. */
  metrics?: ExecutionPlanMetric[];

  /** Filters to apply during execution. */
  filters: ExecutionFilter[];

  /** Grouping/aggregation dimensions; optional. */
  grouping?: ExecutionGrouping;

  /** Result ordering; optional. */
  ordering?: ExecutionOrdering;

  /** Result limit and pagination; optional, the execution layer may default. */
  limit?: ExecutionLimit;

  /** Extra domain-specific execution parameters (e.g. resolved entity IDs). */
  parameters?: Record<string, unknown>;

  /** RCG-009: comparison against a domain-defined benchmark (e.g. "above the national average"); optional, opaque to Universal Core. */
  benchmark?: ExecutionBenchmark;
}
