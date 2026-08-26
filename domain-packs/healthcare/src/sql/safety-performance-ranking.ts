import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const safetyPerformanceRankingSqlTemplate: SqlTemplateDefinition = {
  id: "safety-performance-ranking",

  name: "safety-performance-ranking",

  displayName: "Safety Performance Ranking",

  description:
    "Returns hospitals ranked by safety performance score, calculated from safety measures.",

  template: `
SELECT
    facility_id,
    hospital_name,
    city,
    state,
    county,
    hospital_type,
    safety_measures_better,
    safety_measures_no_different,
    safety_measures_worse,
    facility_safety_measure_count,
    CASE
        WHEN facility_safety_measure_count > 0 THEN
            ROUND(
                (safety_measures_better::numeric / facility_safety_measure_count::numeric) * 100,
                2
            )
        ELSE 0
    END as safety_score
FROM warehouse_hospitals
WHERE facility_safety_measure_count > 0
  AND (
    :state IS NULL
    OR state = :state
  )
ORDER BY safety_score :direction, hospital_name ASC
LIMIT 100;
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "state",
      type: "string",
      required: false,
      description: "Optional state filter",
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
