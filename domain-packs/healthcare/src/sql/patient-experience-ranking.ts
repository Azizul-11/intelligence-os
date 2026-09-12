import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const patientExperienceRankingSqlTemplate: SqlTemplateDefinition = {
  id: "patient-experience-ranking",

  name: "patient-experience-ranking",

  displayName: "Patient Experience Ranking",

  description:
    "Returns hospitals with best patient satisfaction scores. Tier1 Task 5 balanced-limits fix: top 10 overall for a single-state/nationwide request; top 5 PER named state for a multi-state request (ROW_NUMBER() OVER PARTITION BY state), so no single state's tied hospitals crowd out another's.",

  template: `
WITH aggregated_facilities AS (
    SELECT
        h.facility_id,
        h.hospital_name,
        h.state,
        h.city,
        h.county,
        h.ownership,
        h.facility_patient_experience_measure_count,
        h.patient_experience_group_measure_count,
        CAST(AVG(hc.linear_mean_value) AS NUMERIC(10,2)) as avg_patient_satisfaction
    FROM warehouse_hospitals h
    LEFT JOIN warehouse_hospital_hcahps hc
        ON h.facility_id = hc.facility_id
    WHERE
        h.facility_patient_experience_measure_count > 0
        AND (:state IS NULL OR UPPER(h.state) = UPPER(:state))
        AND (:multiState = false OR UPPER(h.state) IN (:states))
        AND (:county IS NULL OR UPPER(h.county) = UPPER(:county))
        AND (:city IS NULL OR UPPER(h.city) = UPPER(:city))
        AND (:ownership IS NULL OR UPPER(h.ownership) LIKE UPPER(:ownership))
    GROUP BY
        h.facility_id,
        h.hospital_name,
        h.state,
        h.city,
        h.county,
        h.ownership,
        h.facility_patient_experience_measure_count,
        h.patient_experience_group_measure_count
    HAVING AVG(hc.linear_mean_value) IS NOT NULL
),
ranked_facilities AS (
    SELECT
        facility_id,
        hospital_name,
        state,
        city,
        county,
        ownership,
        facility_patient_experience_measure_count,
        patient_experience_group_measure_count,
        avg_patient_satisfaction,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN state ELSE 'ALL' END)
            ORDER BY avg_patient_satisfaction :direction NULLS LAST, hospital_name ASC
        ) AS rank_within_scope
    FROM aggregated_facilities
)
SELECT
    facility_id,
    hospital_name,
    state,
    city,
    county,
    ownership,
    facility_patient_experience_measure_count,
    patient_experience_group_measure_count,
    avg_patient_satisfaction
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 5)
    OR (:multiState = false AND rank_within_scope <= 10)
ORDER BY avg_patient_satisfaction :direction NULLS LAST, state ASC, hospital_name ASC
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
      type: "direction",
      required: false,
      description: "Sort direction: ASC or DESC (defaults to DESC)",
    },
  ],

  deterministic: true,

  enabled: true,
};
