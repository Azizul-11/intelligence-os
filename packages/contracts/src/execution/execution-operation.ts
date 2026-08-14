/**
 * Universal execution operations.
 *
 * Represents the high-level intent of what the execution should accomplish.
 * Independent of SQL, domain-specific logic, or implementation details.
 */
export type ExecutionOperation =
  | "lookup" // Retrieve specific records
  | "rank" // Order records by a metric
  | "aggregate" // Compute aggregated values
  | "compare" // Compare values against benchmarks
  | "analyze"; // Analyze trends or patterns
