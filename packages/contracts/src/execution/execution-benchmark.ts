/** Compare the plan's metric against a reference value; `benchmark` is an opaque id from the domain's registry (e.g. "national-average"), never interpreted by Universal Core.
 * Applies only to `ExecutionPlan.metric`. */
export interface ExecutionBenchmark {
  /** Opaque canonical benchmark id from the domain registry; Universal Core must not branch on its values. */
  benchmark: string;

  /** Generic comparison direction. */
  comparison: "above" | "below";
}
