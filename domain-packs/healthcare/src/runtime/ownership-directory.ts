/**
 * Healthcare ownership directory.
 *
 * Hand-maintained (unlike geographic-directory.ts, not generated from a
 * CSV) - the warehouse's own `ownership` column has a small, fixed,
 * CMS-defined set of 12 values, confirmed live via direct DB query
 * (Tier0 Task 5 audit):
 *
 *   Department of Defense, Government - Federal,
 *   Government - Hospital District or Authority, Government - Local,
 *   Government - State, Physician, Proprietary, Tribal,
 *   Veterans Health Administration, Voluntary non-profit - Church,
 *   Voluntary non-profit - Other, Voluntary non-profit - Private
 *
 * There is no single "Non-Profit" value and no single "Government"
 * value - each natural-language ownership phrase maps to a SQL LIKE
 * pattern matching a common prefix shared by several of the raw values
 * above (a many-to-one mapping), never an exact equality - this is why
 * ownership resolution produces a LIKE pattern string (with its own
 * trailing `%` already included) rather than a single warehouse value,
 * unlike state/county/city's exact-match canonical values.
 *
 * Keys are normalized (lowercase, punctuation stripped to spaces, per
 * normalizer.ts/entity-provider.ts's own normalizeText()) for matching.
 */

export interface OwnershipValue {
  /** Human-readable label for clarification/error messages. */
  label: string;
  /** SQL LIKE pattern (with wildcard already included) matching this ownership category's warehouse values. */
  likePattern: string;
}

export const OWNERSHIP = new Map<string, OwnershipValue>([
  ["non profit", { label: "non-profit", likePattern: "Voluntary non-profit%" }],
  ["nonprofit", { label: "non-profit", likePattern: "Voluntary non-profit%" }],
  ["not for profit", { label: "non-profit", likePattern: "Voluntary non-profit%" }],

  ["government", { label: "government", likePattern: "Government%" }],
  ["government owned", { label: "government", likePattern: "Government%" }],
  ["public", { label: "government", likePattern: "Government%" }],
  // Bug L Part A (2026-09-15): common misspellings of "government" -
  // confirmed live that these previously matched nothing at all (exact-
  // match only, no fuzzy correction anywhere in this map), so the
  // ownership filter was silently absent rather than merely mis-typed -
  // the request fell back to a bare geographic/default-ranking shape
  // with no ownership scoping. Same finite, hand-maintained, exact-match
  // convention as every other entry in this map.
  ["goverment", { label: "government", likePattern: "Government%" }],
  ["govt", { label: "government", likePattern: "Government%" }],
  ["gov", { label: "government", likePattern: "Government%" }],
  ["govenment", { label: "government", likePattern: "Government%" }],

  ["proprietary", { label: "proprietary", likePattern: "Proprietary%" }],
  ["for profit", { label: "proprietary", likePattern: "Proprietary%" }],
  ["private", { label: "proprietary", likePattern: "Proprietary%" }],

  ["veterans", { label: "veterans", likePattern: "Veterans Health Administration%" }],
  ["va", { label: "veterans", likePattern: "Veterans Health Administration%" }],
]);
