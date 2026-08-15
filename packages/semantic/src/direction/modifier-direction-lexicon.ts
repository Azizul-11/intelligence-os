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
