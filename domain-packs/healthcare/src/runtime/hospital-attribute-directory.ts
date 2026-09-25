/**
 * Batch 5B-4: hospital-type and attribute-flag directory (audit section 4.6).
 *
 * Hand-maintained, exact-literal vocabulary, the same shape as ownership-directory.ts: a normalized phrase maps to the
 * value its execution parameter binds. `hospital_type` values are matched with a LIKE pattern like ownership (D6:
 * "acute care" is the exact `Acute Care Hospitals` type, 3,115; VA and DoD are reached through the ownership words).
 * The two flags bind the warehouse's own values (`emergency_services` boolean, `birthing_friendly` 'Y').
 *
 * Only multi-word phrases, or single words that are a type on their own ("psychiatric", "childrens"). A hospital name
 * that contains one of these words ("Children's Hospital of Philadelphia") is still a hospital: the entity provider
 * never lets a phrase that is itself a full hospital name resolve here, and a longer hospital-name span suppresses a
 * contained type span in the semantic pipeline.
 */

import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export interface HospitalTypeValue {
  /** The user-facing type name. */
  label: string;
  /** SQL LIKE pattern matching this type's warehouse `hospital_type` value. */
  likePattern: string;
}

const ACUTE: HospitalTypeValue = { label: "acute care", likePattern: "Acute Care Hospitals" };
const CRITICAL: HospitalTypeValue = { label: "critical access", likePattern: "Critical Access Hospitals" };
const CHILDRENS: HospitalTypeValue = { label: "children's", likePattern: "Childrens" };
const PSYCHIATRIC: HospitalTypeValue = { label: "psychiatric", likePattern: "Psychiatric" };
const RURAL_EMERGENCY: HospitalTypeValue = { label: "rural emergency", likePattern: "Rural Emergency Hospital" };

export const HOSPITAL_TYPES = new Map<string, HospitalTypeValue>([
  ["acute care", ACUTE],
  ["critical access", CRITICAL],
  ["childrens", CHILDRENS],
  ["children s", CHILDRENS],
  ["pediatric", CHILDRENS],
  ["psychiatric", PSYCHIATRIC],
  ["rural emergency", RURAL_EMERGENCY],
]);

/** `emergency_services` (boolean). Only this phrase moves: "emergency department", "ER" and "ED" stay unsupported. */
export const EMERGENCY_SERVICES = new Map<string, string>([
  ["emergency services", "true"],
  ["emergency service", "true"],
]);

/** `birthing_friendly` ('Y'); "birthing-friendly" normalizes to the same key. */
export const BIRTHING_FRIENDLY = new Map<string, string>([
  ["birthing friendly", "Y"],
]);

/** The execution parameters the three attribute entities bind (entities/hospital-type.ts and the two flag entities). */
export const HOSPITAL_ATTRIBUTE_PARAMETERS = ["hospitalType", "emergencyServices", "birthingFriendly"] as const;

/**
 * D11: types CMS never rates. 0 overall ratings, 0 scored outcomes, 0 PSI and 0 survey stars (audit section 4.6),
 * so a ranking of them is empty by nature: they are listed, not ranked, and the answer says why.
 */
export const UNRATED_HOSPITAL_TYPES = new Map<string, string>([
  [PSYCHIATRIC.likePattern, "psychiatric"],
  [CHILDRENS.likePattern, "children's"],
  [RURAL_EMERGENCY.likePattern, "rural emergency"],
]);

/**
 * Phase 3.5 (D11 for ownership): an ownership CMS never rates. Department of Defense hospitals: 32, 0 overall ratings,
 * 0 scored outcomes (the 5B audit, confirmed 2026-09-25), so "military hospitals" returned an empty ranking ("Zero rows
 * returned"). They are listed instead, with the reason. Tribal (2 of 16 rated) and physician-owned (19 of 81) are
 * partly rated and stay ranked.
 */
export const UNRATED_OWNERSHIPS = new Map<string, string>([["Department of Defense%", "military (Department of Defense)"]]);

/** How many hospitals the nationwide attribute list matched, for the "first 100 alphabetically" note. */
export const HOSPITAL_ATTRIBUTE_COUNT_TEMPLATE: SqlTemplateDefinition = {
  id: "hospital-attribute-count",
  name: "hospital-attribute-count",
  displayName: "Hospital Attribute Count",
  description: "Counts the hospitals matching the nationwide attribute list's filters (Batch 5B-4 result note).",
  template: `
SELECT COUNT(*) AS matching_count
FROM warehouse_hospitals
WHERE (:ownership IS NULL OR UPPER(ownership) LIKE UPPER(:ownership))
  AND (:hospitalType IS NULL OR UPPER(hospital_type) LIKE UPPER(:hospitalType))
  AND (:emergencyServices IS NULL OR emergency_services = CAST(:emergencyServices AS BOOLEAN))
  AND (:birthingFriendly IS NULL OR birthing_friendly = :birthingFriendly);
`.trim(),
  type: "aggregation",
  parameters: [
    { name: "ownership", type: "string", required: false, description: "Ownership LIKE pattern" },
    { name: "hospitalType", type: "string", required: false, description: "hospital_type LIKE pattern" },
    { name: "emergencyServices", type: "string", required: false, description: "'true' for hospitals with emergency services" },
    { name: "birthingFriendly", type: "string", required: false, description: "'Y' for birthing-friendly hospitals" },
  ],
  deterministic: true,
  enabled: true,
};

/** The nationwide attribute list's row ceiling (sql/hospital-list-nationwide.ts). */
export const NATIONWIDE_LIST_LIMIT = 100;

type CountRunner = (
  template: SqlTemplateDefinition,
  parameters: Record<string, unknown>,
) => Promise<{ success: boolean; rows: readonly unknown[] }>;

/**
 * The attribute note for an answer, or undefined when there is nothing to say:
 * - D11: an unrated type is listed, and the note says CMS does not rate it;
 * - a nationwide attribute list that hit its ceiling says how many matched and that the first 100 are shown.
 */
export async function describeHospitalAttributeResult(input: {
  rows: readonly Record<string, unknown>[];
  parameters: Record<string, unknown> | undefined;
  run: CountRunner;
}): Promise<string | undefined> {
  const { rows, parameters, run } = input;

  if (!parameters || rows.length === 0) {
    return undefined;
  }

  const unrated =
    (typeof parameters.hospitalType === "string" ? UNRATED_HOSPITAL_TYPES.get(parameters.hospitalType) : undefined) ??
    (typeof parameters.ownership === "string" ? UNRATED_OWNERSHIPS.get(parameters.ownership) : undefined);
  const unratedNote = unrated
    ? `CMS does not calculate clinical mortality, safety or overall star ratings for ${unrated} hospitals, so they are listed alphabetically, not ranked.`
    : undefined;

  const nationwide = parameters.state === undefined && parameters.states === undefined && parameters.county === undefined && parameters.city === undefined;
  const hasAttribute = HOSPITAL_ATTRIBUTE_PARAMETERS.some((name) => parameters[name] !== undefined);

  if (!nationwide || !hasAttribute || rows.length < NATIONWIDE_LIST_LIMIT) {
    return unratedNote;
  }

  const scope = Object.fromEntries(
    ["ownership", ...HOSPITAL_ATTRIBUTE_PARAMETERS].filter((name) => parameters[name] !== undefined).map((name) => [name, parameters[name]]),
  );
  const result = await run(HOSPITAL_ATTRIBUTE_COUNT_TEMPLATE, scope);
  const matching = Number((result.rows[0] as { matching_count?: unknown } | undefined)?.matching_count);

  if (!result.success || !Number.isFinite(matching) || matching <= rows.length) {
    return unratedNote;
  }

  const countNote = `${matching.toLocaleString("en-US")} hospitals match nationwide, displaying the first ${rows.length} alphabetically. Add a state to narrow your search.`;

  return unratedNote ? `${unratedNote} ${countNote}` : countNote;
}
