import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const readmissionRateByFacilityIdsSqlTemplate: SqlTemplateDefinition = {
  id: "readmission-rate-by-facility-ids",

  name: "readmission-rate-by-facility-ids",

  displayName: "Readmission Rate By Facility IDs",

  description:
    "Phase 7: fetches readmission measure-classification values for an exact, already-determined set of facility_ids (no ranking, no limit) - used to enrich a multi-metric result with a secondary metric.",

  template: `
SELECT
    facility_id,
    readm_measures_better,
    readm_measures_no_different,
    readm_measures_worse,
    facility_readm_measure_count
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
