/** Generic English superlative modifiers classified by implied ranking direction; mirrors MODIFIERS in ../analyzer/lexicon.ts. */
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

/** Batch 3 (D1): PERFORMANCE words (best/worst) judge the result, all others are MAGNITUDE words naming the number; they differ for lowerIsBetter metrics, so the planner needs the kind. */
export const PERFORMANCE_MODIFIERS = new Set([
  "best",
  "top",
  "worst",
  "bottom",
]);

export type DirectionBasis = "performance" | "magnitude";
