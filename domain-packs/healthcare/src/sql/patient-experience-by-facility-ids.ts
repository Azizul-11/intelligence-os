import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const patientExperienceByFacilityIdsSqlTemplate: SqlTemplateDefinition = {
  id: "patient-experience-by-facility-ids",

  name: "patient-experience-by-facility-ids",

  displayName: "Patient Experience By Facility IDs",

  description:
    "Phase 7: fetches average patient satisfaction for an exact, already-determined set of facility_ids (no ranking, no limit) - used to enrich a multi-metric result with a secondary metric. Mirrors the aggregation shape of patient-experience-ranking (AVG(linear_mean_value) per facility_id), without the ranking template's ORDER BY/LIMIT/HAVING, so that every requested facility_id yields exactly one row (even when its average is NULL) for the secondary-metric merge to key against.",

  template: `
SELECT
    h.facility_id,
    CAST(AVG(hc.linear_mean_value) AS NUMERIC(10,2)) as avg_patient_satisfaction
FROM warehouse_hospitals h
LEFT JOIN warehouse_hospital_hcahps hc
    ON h.facility_id = hc.facility_id
WHERE h.facility_id IN (:facilityIds)
GROUP BY h.facility_id
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
