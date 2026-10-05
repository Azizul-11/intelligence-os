import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

/** Phase 8.6C companion of `hospital-overall-rating-ranking`: coverage only, never ranks or limits. `eligible_count` = hospitals in the same `:state` scope,
 * `covered_count` = those with `overall_rating IS NOT NULL` (a direct per-hospital column, so COUNT is a correct per-entity count). */
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
