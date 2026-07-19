/**
 * Every first-class semantic object supported by IntelligenceOS.
 *
 * This type is intentionally domain-agnostic.
 */
export type SemanticType =
  | "entity"
  | "concept"
  | "metric"
  | "category"
  | "dimension"
  | "relationship"
  | "benchmark";