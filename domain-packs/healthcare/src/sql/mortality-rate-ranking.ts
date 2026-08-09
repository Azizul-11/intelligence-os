import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const mortalityRateRankingSqlTemplate: SqlTemplateDefinition = {
  id: "mortality-rate-ranking",

  name: "mortality-rate-ranking",

  displayName: "Mortality Performance Ranking",

  description:
    "Returns hospitals with best mortality performance based on CMS measure classifications (count of measures better than national average).",

  template: `
SELECT
    h.facility_id,
    h.hospital_name,
    h.state,
    h.mort_measures_better,
    h.mort_measures_no_different,
    h.mort_measures_worse,
    h.facility_mort_measure_count
FROM warehouse_hospitals h
WHERE
    h.facility_mort_measure_count > 0
    AND (
        :state IS NULL
        OR h.state = :state
    )
ORDER BY 
    h.mort_measures_better DESC NULLS LAST,
    h.mort_measures_worse ASC NULLS LAST
LIMIT 10;
`.trim(),

  type: "ranking",

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
