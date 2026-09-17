import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalDetailByFacilityIdsSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-detail-by-facility-ids",

  name: "hospital-detail-by-facility-ids",

  displayName: "Hospital Detail By Facility IDs",

  description:
    "Returns full cross-table profiles for multiple hospitals (2, 3, or more): identity fields plus mortality/readmission/safety/patient-experience measure columns. Used for comparison queries like 'compare Mayo Clinic vs Cleveland Clinic' to return full dossier (~22 fields) for each hospital, not just overall_rating.",

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
WHERE h.facility_id IN (:facilityIds)
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
      name: "facilityIds",
      type: "array",
      required: true,
      description: "Exact set of facility_ids to fetch full dossier for (2, 3, or more hospitals)",
    },
  ],

  deterministic: true,

  enabled: true,
};
