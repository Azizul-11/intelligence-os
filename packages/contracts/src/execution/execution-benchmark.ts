/**
 * Universal execution benchmark comparison.
 *
 * Represents "compare the plan's metric against a reference value" -
 * domain-agnostic in shape, opaque in content. Universal Core never
 * interprets `benchmark`; it is a canonical identifier from the owning
 * Domain SDK's own benchmark registry (e.g. "national-average"), read
 * only by that domain's own execution strategy and SQL templates.
 *
 * Applies to the metric already represented by `ExecutionPlan.metric`.
 * A benchmark against a different field is a future contract decision,
 * not represented here.
 */
export interface ExecutionBenchmark {
  /**
   * Opaque canonical benchmark identifier from the domain's benchmark
   * registry. Universal Core must not know or branch on specific
   * values (e.g. "national-average", "state-average").
   */
  benchmark: string;

  /**
   * Generic comparison direction.
   */
  comparison: "above" | "below";
}
