import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const patientExperienceRankingSqlTemplate: SqlTemplateDefinition = {
  id: "patient-experience-ranking",

  name: "patient-experience-ranking",

  displayName: "Patient Experience Ranking",

  description:
    "Returns hospitals with best patient satisfaction scores.",

  template: `
SELECT
    h.facility_id,
    h.hospital_name,
    h.state,
    h.facility_patient_experience_measure_count,
    h.patient_experience_group_measure_count,
    CAST(AVG(hc.linear_mean_value) AS NUMERIC(10,2)) as avg_patient_satisfaction
FROM warehouse_hospitals h
LEFT JOIN warehouse_hospital_hcahps hc 
    ON h.facility_id = hc.facility_id
WHERE
    h.facility_patient_experience_measure_count > 0
    AND (
        :state IS NULL
        OR h.state = :state
    )
GROUP BY 
    h.facility_id,
    h.hospital_name,
    h.state,
    h.facility_patient_experience_measure_count,
    h.patient_experience_group_measure_count
HAVING AVG(hc.linear_mean_value) IS NOT NULL
ORDER BY avg_patient_satisfaction :direction NULLS LAST
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
