import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const readmissionRateRankingSqlTemplate: SqlTemplateDefinition = {
  id: "readmission-rate-ranking",

  name: "readmission-rate-ranking",

  displayName: "Readmission Performance Ranking",

  description:
    "Returns hospitals with best readmission performance based on CMS measure classifications (count of measures better than national average).",

  template: `
SELECT
    h.facility_id,
    h.hospital_name,
    h.state,
    h.readm_measures_better,
    h.readm_measures_no_different,
    h.readm_measures_worse,
    h.facility_readm_measure_count
FROM warehouse_hospitals h
WHERE
    h.facility_readm_measure_count > 0
    AND (
        :state IS NULL
        OR h.state = :state
    )
ORDER BY 
    h.readm_measures_better DESC NULLS LAST,
    h.readm_measures_worse ASC NULLS LAST
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
