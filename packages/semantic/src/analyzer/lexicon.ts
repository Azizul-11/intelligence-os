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

/**
 * F5 safety gate: a closed, evidence-backed set of English negation/
 * exclusion markers. Presence of any of these anywhere in a query means
 * the current pipeline cannot safely represent what was asked (no
 * negation/exclusion semantics exist anywhere downstream) - the caller
 * must refuse honestly rather than silently treat the negated term as a
 * positive inclusion. This set is intentionally narrow: it is NOT an
 * attempt at negation semantics (no scope resolution, no polarity on
 * any candidate), only detection. Confirmed via repository-wide search
 * to collide with no registered alias, no other lexicon set, and no
 * normalized form of any hyphenated Healthcare vocabulary (e.g.
 * "non-profit" normalizes to "non"/"profit", neither of which is in
 * this set).
 */
export const NEGATORS = new Set([
  "not",
  "excluding",
  "without",
  "except",
]);