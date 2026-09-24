import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

// Batch 5B-2: a clone of hospital-condition-mortality-ranking.ts (same parameters, same WHERE/ORDER BY/limit shape,
// same `:direction` convention) rather than a reuse of that template's id - the PSIs are complication and death
// rates, not the six mortality/CABG measures the mortality template's own description and decorators describe, and
// the units differ per code (the mortality template has none). A shared `score_unit` column keeps the summary
// grounded (Batch 5A-2's numeric cross-check: a unit string containing "1,000" satisfies it as a substring of a row
// value). Units are CMS/AHRQ definitions, not stored in the warehouse - verified against the CMS data dictionary.
export const hospitalConditionSafetyIndicatorRankingSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-condition-safety-indicator-ranking",

  name: "hospital-condition-safety-indicator-ranking",

  displayName: "Patient Safety Indicator Ranking",

  description:
    "Returns hospitals ranked by a specific AHRQ/CMS Patient Safety Indicator (PSI) - a complication or death rate, never a mortality or readmission measure - scoped by :measureCode. Same balanced-limits and :direction convention as hospital-condition-mortality-ranking.ts: top 10 for a single-state/nationwide request, top 5 per named state for a multi-state request; co.score is a raw badness value (a rate or an index) - DESC (the default) orders ascending (lowest/best first), ASC descending (highest/worst first).",

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
        CASE co.measure_code
            WHEN 'PSI_04' THEN 'deaths per 1,000 surgical inpatients'
            WHEN 'PSI_90' THEN 'index (1.0 is national benchmark)'
            ELSE 'rate per 1,000 discharges'
        END AS score_unit,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN h.state ELSE 'ALL' END)
            ORDER BY (CASE WHEN :direction = 'ASC' THEN -co.score ELSE co.score END) ASC NULLS LAST, h.hospital_name ASC
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
        AND (:hospitalType IS NULL OR UPPER(h.hospital_type) LIKE UPPER(:hospitalType))
        AND (:emergencyServices IS NULL OR h.emergency_services = CAST(:emergencyServices AS BOOLEAN))
        AND (:birthingFriendly IS NULL OR h.birthing_friendly = :birthingFriendly)
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
    score_unit,
    compared_to_national
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 5)
    OR (:multiState = false AND rank_within_scope <= 10)
ORDER BY
    (CASE WHEN :direction = 'ASC' THEN -score ELSE score END) ASC NULLS LAST,
    state ASC, hospital_name ASC
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "measureCode",
      type: "string",
      required: true,
      description: "AHRQ/CMS Patient Safety Indicator measure code (e.g. PSI_03, PSI_90) - see domain-packs/healthcare/src/concepts/psi.ts's own measureCodesByMetric map.",
    },
    {
      name: "states",
      type: "array",
      required: false,
      description: "Must be declared before `state` below - SqlExecutor's parameter substitution is a plain text replaceAll per declared parameter, in array order, and \":state\" is a literal substring of \":states\".",
    },
    {
      name: "multiState",
      type: "boolean",
      required: false,
      description: "True when 2+ states were resolved - gates the per-state ceiling.",
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
      description: "Filter hospitals by exact overall_rating value 1-5",
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
      type: "string",
      required: false,
      description:
        "DESC (default) = best first, lowest/safest rate first; ASC = worst first, highest rate first. Normalized upstream from the ranking word and MetricDefinition.lowerIsBetter.",
    },
  ],

  deterministic: true,

  enabled: true,
};
