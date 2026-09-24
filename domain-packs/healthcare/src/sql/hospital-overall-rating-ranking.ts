import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingRankingSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating-ranking",

  name: "hospital-overall-rating-ranking",

  displayName: "Hospital Overall Rating Ranking",

  description:
    "Returns the highest rated hospitals. Tier1 Task 5 balanced-limits fix: a single-state/nationwide request returns the top 10 overall; a multi-state request returns the top 5 PER named state (via ROW_NUMBER() OVER PARTITION BY state), so every requested state gets fair representation instead of one state's tied hospitals crowding out another's.",

  template: `
WITH ranked_facilities AS (
    SELECT
        facility_id,
        hospital_name,
        state,
        city,
        county,
        ownership,
        overall_rating,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN state ELSE 'ALL' END)
            ORDER BY overall_rating :direction NULLS LAST, hospital_name ASC
        ) AS rank_within_scope
    FROM warehouse_hospitals
    WHERE
        overall_rating IS NOT NULL
        AND (:state IS NULL OR UPPER(state) = UPPER(:state))
        AND (:multiState = false OR UPPER(state) IN (:states))
        AND (:county IS NULL OR UPPER(county) = UPPER(:county))
        AND (:city IS NULL OR UPPER(city) = UPPER(:city))
        AND (:ownership IS NULL OR UPPER(ownership) LIKE UPPER(:ownership))
        AND (:overallRating IS NULL OR overall_rating = :overallRating)
        AND (:hospitalType IS NULL OR UPPER(hospital_type) LIKE UPPER(:hospitalType))
        AND (:emergencyServices IS NULL OR emergency_services = CAST(:emergencyServices AS BOOLEAN))
        AND (:birthingFriendly IS NULL OR birthing_friendly = :birthingFriendly)
)
SELECT
    facility_id,
    hospital_name,
    state,
    city,
    county,
    ownership,
    overall_rating
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 5)
    OR (:multiState = false AND rank_within_scope <= 10)
ORDER BY overall_rating :direction NULLS LAST, state ASC, hospital_name ASC
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
      description: "Tier1 Task 5: true when 2+ states were resolved (a \"states\" array is populated) - gates the `states IN (...)` clause below without needing an `IS NULL` check directly on the array parameter itself, which breaks once it holds 2+ comma-separated values (see hospital-list-by-state.ts's simpler, required-array shape for the case that doesn't need this gate at all).",
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
      name: "overallRating",
      type: "string",
      required: false,
      description: "Filter hospitals by exact overall_rating value 1-5 (Pre-Phase 9 Tier1 Task 2)",
    },
    {
      name: "hospitalType",
      type: "string",
      required: false,
      description: "Batch 5B-4: filter by hospital_type, as a SQL LIKE pattern (runtime/hospital-attribute-directory.ts)",
    },
    {
      name: "emergencyServices",
      type: "string",
      required: false,
      description: "Batch 5B-4: 'true' keeps only hospitals that provide emergency services",
    },
    {
      name: "birthingFriendly",
      type: "string",
      required: false,
      description: "Batch 5B-4: 'Y' keeps only CMS Birthing-Friendly hospitals",
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

  // Phase 8.6C: this template's own WHERE clause already applies
  // exactly the eligibility/presence conditions (`overall_rating IS
  // NOT NULL`, the same `:state` scope) the companion coverage
  // template independently re-measures without LIMIT/ORDER BY.
  coverageTemplateId: "hospital-overall-rating-ranking-coverage",
};