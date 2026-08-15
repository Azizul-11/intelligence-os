import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingByFacilityIdsSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating-by-facility-ids",

  name: "hospital-overall-rating-by-facility-ids",

  displayName: "Hospital Overall Rating By Facility IDs",

  description:
    "Phase 7: fetches overall rating values for an exact, already-determined set of facility_ids (no ranking, no limit) - used to enrich a multi-metric result with a secondary metric.",

  template: `
SELECT
    facility_id,
    overall_rating
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
