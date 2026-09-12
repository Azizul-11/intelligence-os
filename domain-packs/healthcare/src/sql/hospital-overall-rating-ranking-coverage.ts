import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

/**
 * Phase 8.6C companion template for `hospital-overall-rating-ranking`.
 * Measures population coverage only - never ranks, never limits.
 * `eligible_count`: hospitals matching the same non-metric scope
 * (`:state`) the ranking template itself uses. `covered_count`: of
 * those, hospitals that also have `overall_rating` present - the same
 * `IS NOT NULL` condition the ranking template applies, computed here
 * as a per-entity column count (safe: `overall_rating` is a direct
 * column on `warehouse_hospitals`, one row per hospital, so
 * `COUNT(overall_rating)` is already a correct per-entity count).
 */
export const hospitalOverallRatingRankingCoverageSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating-ranking-coverage",

  name: "hospital-overall-rating-ranking-coverage",

  displayName: "Hospital Overall Rating Ranking Coverage",

  description:
    "Measures how many hospitals in the requested scope have an overall rating present, out of how many are eligible.",

  template: `
SELECT
    COUNT(*) AS eligible_count,
    COUNT(overall_rating) AS covered_count
FROM warehouse_hospitals
WHERE
    (:state IS NULL OR UPPER(state) = UPPER(:state))
    AND (:county IS NULL OR UPPER(county) = UPPER(:county))
    AND (:city IS NULL OR UPPER(city) = UPPER(:city));
`.trim(),

  type: "aggregation",

  parameters: [
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
  ],

  deterministic: true,

  enabled: true,
};
