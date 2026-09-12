import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalConditionMortalityRankingSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-condition-mortality-ranking",

  name: "hospital-condition-mortality-ranking",

  displayName: "Condition-Specific Mortality Ranking",

  description:
    "Returns hospitals ranked by a specific CMS condition/procedure outcome measure (e.g. AMI, CABG, COPD, Heart Failure, Pneumonia mortality; Hip/Knee complications), scoped by :measureCode. Tier1 Task 5 balanced-limits fix: top 10 overall for a single-state/nationwide request; top 5 PER named state for a multi-state request (ROW_NUMBER() OVER PARTITION BY state), so no single state's tied hospitals crowd out another's.",

  template: `
WITH ranked_facilities AS (
    SELECT
        h.facility_id,
        h.hospital_name,
        h.state,
        h.city,
        h.county,
        h.ownership,
        co.measure_code,
        co.measure_name,
        co.score,
        co.compared_to_national,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN h.state ELSE 'ALL' END)
            ORDER BY (CASE WHEN :direction = 'ASC' THEN -1 ELSE 1 END) * co.score ASC NULLS LAST, h.hospital_name ASC
        ) AS rank_within_scope
    FROM warehouse_hospitals h
    JOIN warehouse_hospital_clinical_outcomes co ON h.facility_id = co.facility_id
    WHERE
        co.measure_code = :measureCode
        AND co.score IS NOT NULL
        AND (:state IS NULL OR UPPER(h.state) = UPPER(:state))
        AND (:multiState = false OR UPPER(h.state) IN (:states))
        AND (:county IS NULL OR UPPER(h.county) = UPPER(:county))
        AND (:city IS NULL OR UPPER(h.city) = UPPER(:city))
        AND (:ownership IS NULL OR UPPER(h.ownership) LIKE UPPER(:ownership))
        AND (:overallRating IS NULL OR h.overall_rating = :overallRating)
)
SELECT
    facility_id,
    hospital_name,
    state,
    city,
    county,
    ownership,
    measure_code,
    measure_name,
    score,
    compared_to_national
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 5)
    OR (:multiState = false AND rank_within_scope <= 10)
ORDER BY
    (CASE WHEN :direction = 'ASC' THEN -1 ELSE 1 END) * score ASC NULLS LAST,
    state ASC, hospital_name ASC
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "measureCode",
      type: "string",
      required: true,
      description: "CMS condition-specific measure code (e.g. MORT_30_AMI, COMP_HIP_KNEE) - see domain-packs/healthcare/src/concepts/*.ts's own measureCodesByMetric map.",
    },
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
      description: "Filter hospitals by county",
    },
    {
      name: "city",
      type: "string",
      required: false,
      description: "Filter hospitals by city",
    },
    {
      name: "ownership",
      type: "string",
      required: false,
      description: "Filter hospitals by ownership category, as a SQL LIKE pattern",
    },
    {
      name: "overallRating",
      type: "string",
      required: false,
      description: "Filter hospitals by exact overall_rating value 1-5 (Pre-Phase 9 Tier1 Task 2)",
    },
    {
      name: "direction",
      type: "string",
      required: false,
      description:
        "DESC (default): best performance first, lowest measure score (fewest adverse events). ASC: worst performance first, highest measure score.",
    },
  ],

  deterministic: true,

  enabled: true,
};
