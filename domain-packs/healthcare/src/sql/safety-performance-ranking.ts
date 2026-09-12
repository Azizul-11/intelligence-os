import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const safetyPerformanceRankingSqlTemplate: SqlTemplateDefinition = {
  id: "safety-performance-ranking",

  name: "safety-performance-ranking",

  displayName: "Safety Performance Ranking",

  description:
    "Returns hospitals ranked by safety performance score, calculated from safety measures. Tier1 Task 5 balanced-limits fix: top 10 overall for a single-state/nationwide request; top 5 PER named state for a multi-state request (ROW_NUMBER() OVER PARTITION BY state), so no single state's tied hospitals crowd out another's.",

  template: `
WITH scored_facilities AS (
    SELECT
        facility_id,
        hospital_name,
        city,
        state,
        county,
        hospital_type,
        ownership,
        safety_measures_better,
        safety_measures_no_different,
        safety_measures_worse,
        facility_safety_measure_count,
        CASE
            WHEN facility_safety_measure_count > 0 THEN
                ROUND(
                    (safety_measures_better::numeric / facility_safety_measure_count::numeric) * 100,
                    2
                )
            ELSE 0
        END as safety_score
    FROM warehouse_hospitals
    WHERE facility_safety_measure_count > 0
      AND (:state IS NULL OR UPPER(state) = UPPER(:state))
      AND (:multiState = false OR UPPER(state) IN (:states))
      AND (:county IS NULL OR UPPER(county) = UPPER(:county))
      AND (:city IS NULL OR UPPER(city) = UPPER(:city))
      AND (:ownership IS NULL OR UPPER(ownership) LIKE UPPER(:ownership))
),
ranked_facilities AS (
    SELECT
        facility_id,
        hospital_name,
        city,
        state,
        county,
        hospital_type,
        ownership,
        safety_measures_better,
        safety_measures_no_different,
        safety_measures_worse,
        facility_safety_measure_count,
        safety_score,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN state ELSE 'ALL' END)
            ORDER BY safety_score :direction, hospital_name ASC
        ) AS rank_within_scope
    FROM scored_facilities
)
SELECT
    facility_id,
    hospital_name,
    city,
    state,
    county,
    hospital_type,
    ownership,
    safety_measures_better,
    safety_measures_no_different,
    safety_measures_worse,
    facility_safety_measure_count,
    safety_score
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 5)
    OR (:multiState = false AND rank_within_scope <= 10)
ORDER BY safety_score :direction, state ASC, hospital_name ASC
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
      description: "Optional state filter",
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
      type: "direction",
      required: false,
      description: "Sort direction: ASC or DESC (defaults to DESC)",
    },
  ],

  deterministic: true,

  enabled: true,
};
