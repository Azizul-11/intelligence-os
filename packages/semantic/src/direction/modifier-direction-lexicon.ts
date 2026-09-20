/**
 * Generic English superlative modifiers, classified by the ranking
 * direction they imply. Domain-agnostic — reused unchanged by any
 * Domain SDK (Healthcare, Education, Finance, ...).
 *
 * Intentionally mirrors the existing MODIFIERS vocabulary in
 * ../analyzer/lexicon.ts (kept as a separate, direction-classified
 * split rather than restructuring that file).
 */
export const DESCENDING_MODIFIERS = new Set([
  "highest",
  "best",
  "top",
  "largest",
]);

export const ASCENDING_MODIFIERS = new Set([
  "lowest",
  "worst",
  "bottom",
  "smallest",
]);

/**
 * Batch 3 (D1): the modifiers above mix two kinds of word. A PERFORMANCE
 * word judges the result ("best", "top", "worst", "bottom": which end is
 * good is part of the word); every other modifier is a MAGNITUDE word that
 * names the number itself ("highest", "lowest", "largest", "smallest").
 * For a metric where higher is better the two kinds agree; for a metric
 * where lower is better (`MetricDefinition.lowerIsBetter`) they do not, so
 * the planner needs to know which kind it was given. Generic English,
 * domain-agnostic.
 */
export const PERFORMANCE_MODIFIERS = new Set([
  "best",
  "top",
  "worst",
  "bottom",
]);

export type DirectionBasis = "performance" | "magnitude";
