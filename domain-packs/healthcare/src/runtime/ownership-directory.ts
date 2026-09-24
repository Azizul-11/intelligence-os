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
  // Batch 3: "state owned" names one sub-label, not all government ownership (the warehouse's own value is
  // "Government - State"); a broader "Government%" match returned county and federal hospitals as state-owned ones.
  ["state owned", { label: "government", likePattern: "Government - State%" }],
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

  // Batch 5B-1: ownership sub-labels (Batch 4 deferred these to "post-baseline capability expansion"; that hold is
  // lifted here). Multi-word keys only, except "tribal" and "military" bare (0 and 1 hospital-name collisions,
  // section 2.9 of the 5B audit; the one collision, Walter Reed National Military Med Cen, is a full official name
  // resolved by the hospital-identity matcher first, ahead of this generic ownership lookup).
  ["church owned", { label: "church-owned", likePattern: "Voluntary non-profit - Church%" }],
  ["church affiliated", { label: "church-owned", likePattern: "Voluntary non-profit - Church%" }],

  ["physician owned", { label: "physician-owned", likePattern: "Physician%" }],

  ["tribal", { label: "tribal", likePattern: "Tribal%" }],
  ["tribal owned", { label: "tribal", likePattern: "Tribal%" }],

  // D5: "military" means Department of Defense (32 facilities); VA hospitals are the separate "veterans" ownership
  // above and are never folded in here (a ranking already exists for VA under "veterans").
  ["department of defense", { label: "military", likePattern: "Department of Defense%" }],
  ["dod", { label: "military", likePattern: "Department of Defense%" }],
  ["military", { label: "military", likePattern: "Department of Defense%" }],
  ["military owned", { label: "military", likePattern: "Department of Defense%" }],

  // Government sub-labels: same broad "government" label as "state owned" above (a precise likePattern, a shared
  // user-facing category name) - not part of Batch 5B-1's own catalog rows, added for completeness of the directory.
  ["federal owned", { label: "government", likePattern: "Government - Federal%" }],
  ["federal government", { label: "government", likePattern: "Government - Federal%" }],
  ["local government", { label: "government", likePattern: "Government - Local%" }],
  ["locally owned", { label: "government", likePattern: "Government - Local%" }],
  ["hospital district", { label: "government", likePattern: "Government - Hospital District or Authority%" }],
  ["district owned", { label: "government", likePattern: "Government - Hospital District or Authority%" }],
]);
