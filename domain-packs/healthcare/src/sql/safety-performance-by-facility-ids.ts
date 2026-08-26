import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const safetyPerformanceByFacilityIdsSqlTemplate: SqlTemplateDefinition = {
  id: "safety-performance-by-facility-ids",

  name: "safety-performance-by-facility-ids",

  displayName: "Safety Performance By Facility IDs",

  description:
    "Phase 7: fetches safety measure-classification values for an exact, already-determined set of facility_ids (no ranking, no limit) - used to enrich a multi-metric result with a secondary metric.",

  template: `
SELECT
    facility_id,
    safety_measures_better,
    safety_measures_no_different,
    safety_measures_worse,
    facility_safety_measure_count
FROM warehouse_hospitals
WHERE facility_id IN (:facilityIds)
`.trim(),

  type: "lookup",

  parameters: [
    {
      name: "facilityIds",
      type: "array",
      required: true,
      description: "Exact set of facility_ids to fetch this metric for",
    },
  ],

  deterministic: true,

  enabled: true,
};
