import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

/**
 * Phase 8.6C companion template for `mortality-rate-ranking`. Measures
 * population coverage only - never ranks, never limits. `eligible_count`:
 * hospitals matching the same non-metric scope (`:state`) the ranking
 * template itself uses. `covered_count`: of those, hospitals with
 * `facility_mort_measure_count > 0` - the same eligibility condition
 * the ranking template applies. Safe as a direct per-entity count:
 * `facility_mort_measure_count` is a pre-aggregated column already
 * stored directly on `warehouse_hospitals` (one row per hospital), not
 * a raw row count against the underlying multi-row
 * `warehouse_hospital_clinical_outcomes` detail table - no distinct-
 * entity join is needed here.
 */
export const mortalityRateRankingCoverageSqlTemplate: SqlTemplateDefinition = {
  id: "mortality-rate-ranking-coverage",

  name: "mortality-rate-ranking-coverage",

  displayName: "Mortality Rate Ranking Coverage",

  description:
    "Measures how many hospitals in the requested scope have mortality measure data present, out of how many are eligible.",

  template: `
SELECT
    COUNT(*) AS eligible_count,
    COUNT(*) FILTER (WHERE facility_mort_measure_count > 0) AS covered_count
FROM warehouse_hospitals
WHERE
    :state IS NULL
    OR state = :state;
`.trim(),

  type: "aggregation",

  parameters: [
    {
      name: "state",
      type: "string",
      required: false,
      description: "Filter hospitals by state",
    },
  ],

  deterministic: true,

  enabled: true,
};
