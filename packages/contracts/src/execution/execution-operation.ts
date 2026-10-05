/** Universal high-level execution intent, independent of SQL and domain logic. */
export type ExecutionOperation =
  | "lookup" // Retrieve specific records
  | "rank" // Order records by a metric
  | "aggregate" // Compute aggregated values
  | "compare" // Compare values against benchmarks
  | "analyze"; // Analyze trends or patterns
