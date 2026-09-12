import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const mortalityRateRankingSqlTemplate: SqlTemplateDefinition = {
  id: "mortality-rate-ranking",

  name: "mortality-rate-ranking",

  displayName: "Mortality Performance Ranking",

  description:
    "Returns hospitals with best mortality performance based on CMS measure classifications (count of measures better than national average). Tier1 Task 5 balanced-limits fix: top 10 overall for a single-state/nationwide request; top 5 PER named state for a multi-state request (ROW_NUMBER() OVER PARTITION BY state), so no single state's tied hospitals crowd out another's.",

  template: `
WITH ranked_facilities AS (
    SELECT
        h.facility_id,
        h.hospital_name,
        h.state,
        h.city,
        h.county,
        h.ownership,
        h.mort_measures_better,
        h.mort_measures_no_different,
        h.mort_measures_worse,
        h.facility_mort_measure_count,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN h.state ELSE 'ALL' END)
            ORDER BY
                CASE WHEN :direction = 'ASC' THEN h.mort_measures_worse ELSE h.mort_measures_better END DESC NULLS LAST,
                CASE WHEN :direction = 'ASC' THEN h.mort_measures_better ELSE h.mort_measures_worse END ASC NULLS LAST,
                h.hospital_name ASC
        ) AS rank_within_scope
    FROM warehouse_hospitals h
    WHERE
        h.facility_mort_measure_count > 0
        AND (:state IS NULL OR UPPER(h.state) = UPPER(:state))
        AND (:multiState = false OR UPPER(h.state) IN (:states))
        AND (:county IS NULL OR UPPER(h.county) = UPPER(:county))
        AND (:city IS NULL OR UPPER(h.city) = UPPER(:city))
        AND (:ownership IS NULL OR UPPER(h.ownership) LIKE UPPER(:ownership))
)
SELECT
    facility_id,
    hospital_name,
    state,
    city,
    county,
    ownership,
    mort_measures_better,
    mort_measures_no_different,
    mort_measures_worse,
    facility_mort_measure_count
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 5)
    OR (:multiState = false AND rank_within_scope <= 10)
ORDER BY
    CASE WHEN :direction = 'ASC' THEN mort_measures_worse ELSE mort_measures_better END DESC NULLS LAST,
    CASE WHEN :direction = 'ASC' THEN mort_measures_better ELSE mort_measures_worse END ASC NULLS LAST,
    state ASC, hospital_name ASC
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "states",
      type: "array",
      required: false,
      description: "Tier1 Task 5: must be declared before `state` below - SqlExecutor's parameter substitution is a plain text replaceAll per declared parameter, in array order, and \":state\" is a literal substring of \":states\"; substituting \":state\" first would corrupt every \":states\" occurrence still present in the SQL text.",
    },
    {
      name: "multiState",
      type: "boolean",
      required: false,
      description: "Tier1 Task 5: true when 2+ states were resolved (a \"states\" array is populated) - gates the `states IN (...)` clause below without needing an `IS NULL` check directly on the array parameter itself, which breaks once it holds 2+ comma-separated values.",
    },
    {
      name: "state",
      type: "string",
      required: false,
      description: "Filter hospitals by state",
    },
    {
      name: "county",
      type: "string",
      required: false,
      description: "Filter hospitals by county (Pre-Phase 9 Tier0 Task 1)",
    },
    {
      name: "city",
      type: "string",
      required: false,
      description: "Filter hospitals by city (Pre-Phase 9 Tier0 Task 1)",
    },
    {
      name: "ownership",
      type: "string",
      required: false,
      description: "Filter hospitals by ownership category, as a SQL LIKE pattern (Pre-Phase 9 Tier0 Task 5)",
    },
    {
      name: "direction",
      type: "string",
      required: false,
      description:
        "DESC (default): best performance first, ranked by most measures better-than-national, tied hospitals broken by fewest worse-than-national. ASC: worst performance first - the primary and tiebreak columns swap (most measures worse-than-national first, tied hospitals broken by fewest better-than-national), not merely a reversed sort of the DESC ordering. Declared as type \"string\" (compared against a literal in the ORDER BY CASE expression below), not type \"direction\" - this template never uses :direction as a bare trailing ORDER BY keyword, so the RCG-019 bare-keyword rendering does not apply here.",
    },
  ],

  deterministic: true,

  enabled: true,

  // Phase 8.6C: `facility_mort_measure_count > 0` (this template's own
  // eligibility condition, alongside the same `:state` scope) is
  // independently re-measured, without LIMIT/ORDER BY, by the
  // companion coverage template.
  coverageTemplateId: "mortality-rate-ranking-coverage",
};
