export const MODIFIERS = new Set([
  "highest",
  "lowest",
  "best",
  "worst",
  "top",
  "bottom",
  "largest",
  "smallest",
]);

export const OPERATORS = new Set([
  "greater",
  "less",
  "above",
  "below",
  "between",
]);

export const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on",
]);

/** F5 safety gate: narrow closed set of negation markers; detection only (no negation semantics downstream), so the caller must refuse. Collides with no alias or lexicon ("non-profit" normalizes to non/profit, neither listed). */
export const NEGATORS = new Set([
  "not",
  "excluding",
  "without",
  "except",
]);