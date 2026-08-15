import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const mortalityRateByFacilityIdsSqlTemplate: SqlTemplateDefinition = {
  id: "mortality-rate-by-facility-ids",

  name: "mortality-rate-by-facility-ids",

  displayName: "Mortality Rate By Facility IDs",

  description:
    "Phase 7: fetches mortality measure-classification values for an exact, already-determined set of facility_ids (no ranking, no limit) - used to enrich a multi-metric result with a secondary metric.",

  template: `
SELECT
    facility_id,
    mort_measures_better,
    mort_measures_no_different,
    mort_measures_worse,
    facility_mort_measure_count
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
