import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

import { STATE_NAMES_BY_CODE } from "./execution-strategy";
import { describeHospitalAttributeResult, HOSPITAL_ATTRIBUTE_PARAMETERS, UNRATED_OWNERSHIPS } from "./hospital-attribute-directory";

/**
 * Batch 5A-1 (D5): the plain overall-rating ranking returns the first 10 hospitals of everything that ties for the
 * top rating, in alphabetical order (`ORDER BY overall_rating, hospital_name` inside the template): 384 hospitals hold
 * 5 stars nationwide, so "best hospital" shows ten of 384 and nothing says so. This counts the tie, in the exact scope
 * the ranking ran with (the parameters the engine reports as `executedParameters`), so the answer can say it.
 *
 * The template below is deliberately not registered with the domain's templates: it is only ever run by the caller
 * of `describeOverallRatingTies`, never selected for a question, so it cannot become a capability, a suggestion or a
 * coverage fact by accident. Its parameters are declared in the same order as the ranking template's (`states` before
 * `state`: the executor substitutes by plain text replacement per declared parameter).
 */
export const OVERALL_RATING_TIE_COUNT_TEMPLATE: SqlTemplateDefinition = {
  id: "hospital-overall-rating-tie-count",
  name: "hospital-overall-rating-tie-count",
  displayName: "Hospital Overall Rating Tie Count",
  description: "Counts the hospitals that hold one given overall rating in the scope a ranking ran with.",
  template: `
SELECT
    COUNT(*) AS tied_count
FROM warehouse_hospitals
WHERE
    overall_rating = :topRating
    AND (:state IS NULL OR UPPER(state) = UPPER(:state))
    AND (:multiState = false OR UPPER(state) IN (:states))
    AND (:county IS NULL OR UPPER(county) = UPPER(:county))
    AND (:city IS NULL OR UPPER(city) = UPPER(:city))
    AND (:ownership IS NULL OR UPPER(ownership) LIKE UPPER(:ownership))
    AND (:hospitalType IS NULL OR UPPER(hospital_type) LIKE UPPER(:hospitalType))
    AND (:emergencyServices IS NULL OR emergency_services = CAST(:emergencyServices AS BOOLEAN))
    AND (:birthingFriendly IS NULL OR birthing_friendly = :birthingFriendly);
`.trim(),
  type: "aggregation",
  parameters: [
    { name: "states", type: "array", required: false, description: "Declared before `state`, as in the ranking template." },
    { name: "multiState", type: "boolean", required: false, description: "True when 2+ states were resolved." },
    { name: "state", type: "string", required: false, description: "Filter hospitals by state" },
    { name: "county", type: "string", required: false, description: "Filter hospitals by county" },
    { name: "city", type: "string", required: false, description: "Filter hospitals by city" },
    { name: "ownership", type: "string", required: false, description: "Filter hospitals by ownership category, as a SQL LIKE pattern" },
    { name: "hospitalType", type: "string", required: false, description: "Batch 5B-4: hospital_type LIKE pattern" },
    { name: "emergencyServices", type: "string", required: false, description: "Batch 5B-4: 'true' for hospitals with emergency services" },
    { name: "birthingFriendly", type: "string", required: false, description: "Batch 5B-4: 'Y' for birthing-friendly hospitals" },
    { name: "topRating", type: "string", required: false, description: "The overall rating whose holders are counted" },
  ],
  deterministic: true,
  enabled: true,
};

/**
 * The columns of the plain ranking's rows (the engine returns them as city, state, county, ownership, facility_id,
 * hospital_name, overall_rating): the only shape this describes. The per-state view (state, facility_id,
 * hospital_name, overall_rating) and every other ranking lack some of them.
 */
const PLAIN_RANKING_COLUMNS = ["facility_id", "hospital_name", "state", "city", "county", "ownership", "overall_rating"];

const SCOPE_PARAMETERS = ["states", "multiState", "state", "county", "city", "ownership", ...HOSPITAL_ATTRIBUTE_PARAMETERS] as const;

export type TieSqlRunner = (
  template: SqlTemplateDefinition,
  parameters: Record<string, unknown>,
) => Promise<{ success: boolean; rows: readonly unknown[] }>;

export function formatTieNote(tied: number, shown: number, rating: number | string, scope: { nationwide: boolean; state?: string }): string {
  const where = scope.nationwide ? "nationwide" : scope.state ? `in ${scope.state}` : "in this search";
  return `${tied.toLocaleString("en-US")} hospitals ${where} hold a ${rating}-star overall rating, displaying the first ${shown} alphabetically. Add a state or condition to narrow your search.`;
}

/**
 * The tie disclosure for an overall-rating ranking, or undefined when there is nothing to disclose: not the plain
 * ranking, a multi-state request (a fixed 5 per state), rows that do not all hold the same rating, or no more
 * hospitals holding it than are shown.
 */
export async function describeOverallRatingTies(input: {
  rows: readonly Record<string, unknown>[];
  parameters: Record<string, unknown> | undefined;
  run: TieSqlRunner;
}): Promise<string | undefined> {
  const { rows, parameters, run } = input;
  const first = rows[0];

  // Batch 5B-4: a hospital-type or flag filter has its own note first (D11 for an unrated type, or how many a nationwide
  // list matched); otherwise the tie below is counted with those filters too (SCOPE_PARAMETERS).
  const filtered =
    parameters !== undefined &&
    (HOSPITAL_ATTRIBUTE_PARAMETERS.some((name) => parameters[name] !== undefined) ||
      (typeof parameters.ownership === "string" && UNRATED_OWNERSHIPS.has(parameters.ownership)));
  const attributeNote = filtered ? await describeHospitalAttributeResult({ rows, parameters, run }) : undefined;

  if (attributeNote) {
    return attributeNote;
  }

  if (!parameters || !first || parameters.multiState === true || rows.length < 2 || !PLAIN_RANKING_COLUMNS.every((column) => column in first)) {
    return undefined;
  }

  const ratings = new Set(rows.map((row) => row.overall_rating));
  const rating = [...ratings][0];

  if (ratings.size !== 1 || (typeof rating !== "number" && typeof rating !== "string")) {
    return undefined;
  }

  const scope = Object.fromEntries(SCOPE_PARAMETERS.filter((name) => parameters[name] !== undefined).map((name) => [name, parameters[name]]));
  const result = await run(OVERALL_RATING_TIE_COUNT_TEMPLATE, { ...scope, topRating: String(rating) });
  const tied = Number((result.rows[0] as { tied_count?: unknown } | undefined)?.tied_count);

  if (!result.success || !Number.isFinite(tied) || tied <= rows.length) {
    return undefined;
  }

  const onlyState = typeof parameters.state === "string" && parameters.county === undefined && parameters.city === undefined && parameters.ownership === undefined && !filtered;
  const nationwide = scope.state === undefined && scope.county === undefined && scope.city === undefined && scope.ownership === undefined && !filtered;

  return formatTieNote(tied, rows.length, rating, {
    nationwide,
    ...(onlyState ? { state: STATE_NAMES_BY_CODE.get(String(parameters.state)) ?? String(parameters.state) } : {}),
  });
}
