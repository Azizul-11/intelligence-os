import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

// Batch 5B-3: one HCAHPS survey dimension, scoped by :measureCode (concepts/hcahps-dimensions.ts). Every read of
// warehouse_hospital_hcahps is pinned to a single measure_code (the 5B audit's own unfiltered 326K-row aggregate hit
// the RPC statement timeout). The composite patient-experience-ranking template is untouched.
//  - score: the dimension's linear mean score (0-100, higher is better); for the summary star (H_STAR_RATING, which
//    has no linear score) the star value itself.
//  - star_rating: the dimension's own 1-5 star, from its matching _STAR_RATING row. Star values are text and the
//    non-star rows hold 'Not Applicable' (not null), so only '1'..'5' is read as a star.
//  - :direction is the SQL keyword, as in patient-experience-ranking: DESC (default) = highest score = best first.
export const hospitalHcahpsDimensionRankingSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-hcahps-dimension-ranking",

  name: "hospital-hcahps-dimension-ranking",

  displayName: "Patient Survey Dimension Ranking",

  description:
    "Returns hospitals ranked by one HCAHPS patient-survey dimension (cleanliness, quietness, nurse or doctor communication, communication about medicines, discharge information, would recommend, overall survey rating, or the summary star rating), scoped by :measureCode. Higher is better. Top 10 for a single-state/nationwide request, top 5 per named state for a multi-state request.",

  template: `
WITH dimension_scores AS (
    SELECT
        h.facility_id,
        h.hospital_name,
        h.state,
        h.city,
        h.county,
        h.ownership,
        p.measure_code,
        p.question AS dimension_name,
        COALESCE(
            p.linear_mean_value,
            CASE WHEN p.patient_survey_star_rating IN ('1', '2', '3', '4', '5') THEN CAST(p.patient_survey_star_rating AS NUMERIC) END
        ) AS score,
        CASE WHEN s.patient_survey_star_rating IN ('1', '2', '3', '4', '5') THEN CAST(s.patient_survey_star_rating AS INTEGER) END AS star_rating
    FROM warehouse_hospitals h
    JOIN warehouse_hospital_hcahps p
        ON p.facility_id = h.facility_id
        AND p.measure_code = :measureCode
    LEFT JOIN warehouse_hospital_hcahps s
        ON s.facility_id = h.facility_id
        AND s.measure_code = REPLACE(:measureCode, '_LINEAR_SCORE', '_STAR_RATING')
    WHERE
        (:state IS NULL OR UPPER(h.state) = UPPER(:state))
        AND (:multiState = false OR UPPER(h.state) IN (:states))
        AND (:county IS NULL OR UPPER(h.county) = UPPER(:county))
        AND (:city IS NULL OR UPPER(h.city) = UPPER(:city))
        AND (:ownership IS NULL OR UPPER(h.ownership) LIKE UPPER(:ownership))
        AND (:overallRating IS NULL OR h.overall_rating = :overallRating)
),
ranked_facilities AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN state ELSE 'ALL' END)
            ORDER BY score :direction NULLS LAST, hospital_name ASC
        ) AS rank_within_scope
    FROM dimension_scores
    WHERE score IS NOT NULL
)
SELECT
    facility_id,
    hospital_name,
    state,
    city,
    county,
    ownership,
    measure_code,
    dimension_name,
    score,
    star_rating
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 5)
    OR (:multiState = false AND rank_within_scope <= 10)
ORDER BY score :direction NULLS LAST, state ASC, hospital_name ASC
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "measureCode",
      type: "string",
      required: true,
      description: "HCAHPS linear-score code (e.g. H_CLEAN_LINEAR_SCORE) or H_STAR_RATING - see concepts/hcahps-dimensions.ts's own measureCodesByMetric map.",
    },
    {
      name: "states",
      type: "array",
      required: false,
      description: "Must be declared before `state` - SqlExecutor substitutes parameters by plain text replace, in array order, and \":state\" is a substring of \":states\".",
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
      name: "direction",
      type: "direction",
      required: false,
      description: "Sort direction: DESC (default) = highest score = best first; ASC = lowest first.",
    },
  ],

  deterministic: true,

  enabled: true,
};
