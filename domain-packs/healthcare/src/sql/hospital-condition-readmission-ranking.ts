import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalConditionReadmissionRankingSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-condition-readmission-ranking",

  name: "hospital-condition-readmission-ranking",

  displayName: "Condition-Specific Readmission Ranking",

  description:
    "Returns hospitals ranked by a specific CMS condition/procedure readmission measure (e.g. AMI, CABG, COPD, Hip/Knee, Heart Failure, Pneumonia readmission), scoped by :measureCode. Tier1 Task 5 balanced-limits fix: top 10 overall for a single-state/nationwide request; top 5 PER named state for a multi-state request (ROW_NUMBER() OVER PARTITION BY state), so no single state's tied hospitals crowd out another's. " +
    "PrePhase 9.5 Round 3: `excess_readmission_ratio` is a raw badness value (>1 means more readmissions than expected) - lower is always better. The ORDER BY is unconditionally ascending (lowest/best first) regardless of `:direction`, which used to flip it via a CASE expression - see the identical fix/rationale in hospital-condition-mortality-ranking.ts's own description (same lexical-ambiguity root cause: \"lowest\"/\"worst\" share one generic direction bucket upstream). ponytail: same known ceiling (no \"worst-first\" support for this measure), same upgrade path.",

  template: `
WITH ranked_facilities AS (
    SELECT
        h.facility_id,
        h.hospital_name,
        h.state,
        h.city,
        h.county,
        h.ownership,
        r.measure_code,
        r.predicted_readmission_rate,
        r.expected_readmission_rate,
        r.excess_readmission_ratio,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN h.state ELSE 'ALL' END)
            ORDER BY r.excess_readmission_ratio ASC NULLS LAST, h.hospital_name ASC
        ) AS rank_within_scope
    FROM warehouse_hospitals h
    JOIN warehouse_hospital_readmissions r ON h.facility_id = r.facility_id
    WHERE
        r.measure_code = :measureCode
        AND r.excess_readmission_ratio IS NOT NULL
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
    predicted_readmission_rate,
    expected_readmission_rate,
    excess_readmission_ratio
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 5)
    OR (:multiState = false AND rank_within_scope <= 10)
ORDER BY
    excess_readmission_ratio ASC NULLS LAST,
    state ASC, hospital_name ASC
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "measureCode",
      type: "string",
      required: true,
      description: "CMS condition-specific readmission measure code (e.g. READM-30-AMI-HRRP) - see domain-packs/healthcare/src/concepts/*.ts's own measureCodesByMetric map.",
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
        "PrePhase 9.5 Round 3: no longer consumed by this template's ORDER BY - see the ponytail comment on the template description for why.",
    },
  ],

  deterministic: true,

  enabled: true,
};
