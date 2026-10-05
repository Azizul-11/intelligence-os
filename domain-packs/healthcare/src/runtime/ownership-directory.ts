/** Hand-maintained (not generated) ownership phrases for the 12 CMS `ownership` values (Tier0 Task 5 audit); there is no single "Non-Profit"/"Government" value,
 * so each phrase maps to a SQL LIKE pattern (trailing `%` included), not an exact value. Keys are normalized like normalizeText(). */

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
  // Batch 3: "state owned" is the "Government - State" sub-label only (a broad "Government%" returned county/federal). V4 Batch 4: it needs its own label, not "government",
  // because the prompt's ownership list is built from unique labels and sharing one collapsed this into the generic filter.
  ["state owned", { label: "state-owned", likePattern: "Government - State%" }],
  ["state-owned", { label: "state-owned", likePattern: "Government - State%" }],
  ["public", { label: "government", likePattern: "Government%" }],
  // Bug L Part A (2026-09-15): misspellings of "government" matched nothing (exact-match only), silently dropping the ownership filter.
  ["goverment", { label: "government", likePattern: "Government%" }],
  ["govt", { label: "government", likePattern: "Government%" }],
  ["gov", { label: "government", likePattern: "Government%" }],
  ["govenment", { label: "government", likePattern: "Government%" }],

  ["proprietary", { label: "proprietary", likePattern: "Proprietary%" }],
  ["for profit", { label: "proprietary", likePattern: "Proprietary%" }],
  ["private", { label: "proprietary", likePattern: "Proprietary%" }],

  ["veterans", { label: "veterans", likePattern: "Veterans Health Administration%" }],
  ["va", { label: "veterans", likePattern: "Veterans Health Administration%" }],

  // Batch 5B-1: ownership sub-labels, multi-word keys except bare "tribal"/"military" (0 and 1 name collisions; Walter Reed is a full official name matched first).
  ["church owned", { label: "church-owned", likePattern: "Voluntary non-profit - Church%" }],
  ["church affiliated", { label: "church-owned", likePattern: "Voluntary non-profit - Church%" }],
  // 2,000 sweep (Batch B1): everyday words for the same sub-label. "catholic" is bare although 2 hospital names contain
  // it ("Catholic Medical Center"): a full hospital name is the longer span and wins; "faith" alone is never a key (3 names).
  ["faith based", { label: "church-owned", likePattern: "Voluntary non-profit - Church%" }],
  ["catholic", { label: "church-owned", likePattern: "Voluntary non-profit - Church%" }],
  ["religious", { label: "church-owned", likePattern: "Voluntary non-profit - Church%" }],

  ["physician owned", { label: "physician-owned", likePattern: "Physician%" }],
  // Batch B1: "doctor owned" was read as the doctor communication score (lay-vocabulary.ts keeps "doctor" off it now).
  ["doctor owned", { label: "physician-owned", likePattern: "Physician%" }],
  ["doctor run", { label: "physician-owned", likePattern: "Physician%" }],
  ["physician run", { label: "physician-owned", likePattern: "Physician%" }],

  ["tribal", { label: "tribal", likePattern: "Tribal%" }],
  ["tribal owned", { label: "tribal", likePattern: "Tribal%" }],
  ["native american", { label: "tribal", likePattern: "Tribal%" }],

  // D5: "military" means Department of Defense (32 facilities); VA hospitals are the separate "veterans" ownership
  // above and are never folded in here (a ranking already exists for VA under "veterans").
  ["department of defense", { label: "military", likePattern: "Department of Defense%" }],
  ["dod", { label: "military", likePattern: "Department of Defense%" }],
  ["military", { label: "military", likePattern: "Department of Defense%" }],
  ["military owned", { label: "military", likePattern: "Department of Defense%" }],
  // Batch B1: the branches (0 hospital-name collisions for "navy" / "air force"; "army" only in Brooke Army Medical Center,
  // itself a DoD hospital and a full name that wins as the longer span).
  ["army", { label: "military", likePattern: "Department of Defense%" }],
  ["navy", { label: "military", likePattern: "Department of Defense%" }],
  ["air force", { label: "military", likePattern: "Department of Defense%" }],

  // 2,000 sweep (Batch B1): each government sub-label has its OWN label (the ownership words in capability-catalog.ts `ownerships`); sharing "government"
  // made the model write back "government" and match every government hospital. Each label is also a key below.
  ["federal", { label: "federal", likePattern: "Government - Federal%" }],
  ["federally owned", { label: "federal", likePattern: "Government - Federal%" }],
  ["federal owned", { label: "federal", likePattern: "Government - Federal%" }],
  ["federal government", { label: "federal", likePattern: "Government - Federal%" }],
  ["local government", { label: "local government", likePattern: "Government - Local%" }],
  ["locally owned", { label: "local government", likePattern: "Government - Local%" }],
  ["city owned", { label: "local government", likePattern: "Government - Local%" }],
  ["county owned", { label: "local government", likePattern: "Government - Local%" }],
  ["hospital district", { label: "hospital district", likePattern: "Government - Hospital District or Authority%" }],
  ["district owned", { label: "hospital district", likePattern: "Government - Hospital District or Authority%" }],
]);
