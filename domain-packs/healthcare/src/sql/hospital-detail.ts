import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalDetailSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-detail",

  name: "hospital-detail",

  displayName: "Hospital Detail",

  description:
    "Returns a full cross-table profile for a single hospital: identity fields plus the same mortality/readmission/safety/patient-experience measure columns the multi-hospital compare path already fetches via its -by-facility-ids templates.",

  template: `
SELECT
    h.facility_id,
    h.hospital_name,
    h.city,
    h.state,
    h.county,
    h.hospital_type,
    h.ownership,
    h.overall_rating,
    h.emergency_services,
    COALESCE(h.birthing_friendly, 'N') AS birthing_friendly,
    h.mort_measures_better,
    h.mort_measures_no_different,
    h.mort_measures_worse,
    h.facility_mort_measure_count,
    h.readm_measures_better,
    h.readm_measures_no_different,
    h.readm_measures_worse,
    h.facility_readm_measure_count,
    h.safety_measures_better,
    h.safety_measures_no_different,
    h.safety_measures_worse,
    h.facility_safety_measure_count,
    CAST(AVG(hc.linear_mean_value) AS NUMERIC(10,2)) AS avg_patient_satisfaction
FROM warehouse_hospitals h
LEFT JOIN warehouse_hospital_hcahps hc
    ON h.facility_id = hc.facility_id
WHERE h.facility_id = :hospitalId
GROUP BY
    h.facility_id,
    h.hospital_name,
    h.city,
    h.state,
    h.county,
    h.hospital_type,
    h.ownership,
    h.overall_rating,
    h.emergency_services,
    h.birthing_friendly,
    h.mort_measures_better,
    h.mort_measures_no_different,
    h.mort_measures_worse,
    h.facility_mort_measure_count,
    h.readm_measures_better,
    h.readm_measures_no_different,
    h.readm_measures_worse,
    h.facility_readm_measure_count,
    h.safety_measures_better,
    h.safety_measures_no_different,
    h.safety_measures_worse,
    h.facility_safety_measure_count
`.trim(),

  type: "lookup",

  parameters: [
    {
      name: "hospitalId",
      type: "string",
      required: true,
      description: "Hospital identifier",
    },
  ],

  deterministic: true,

  enabled: true,

  // Phase 8.6B: this template's only filter is the requested hospital's
  // own identity in `warehouse_hospitals` - the same table entity
  // resolution itself uses, so a validly-resolved hospital can never
  // actually produce zero rows here. Opted in for consistency (safe,
  // though effectively inert for this specific template).
  singleEntityRecord: true,
};
