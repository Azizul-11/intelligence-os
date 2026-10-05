import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

/** Phase 8.6C companion of `mortality-rate-ranking`: coverage only, never ranks or limits. `eligible_count` = hospitals in the same `:state` scope,
 * `covered_count` = those with `facility_mort_measure_count > 0`, a pre-aggregated per-hospital column, so no distinct-entity join is needed. */
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
