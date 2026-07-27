import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const readmissionRateSqlTemplate: SqlTemplateDefinition = {
  id: "readmission-rate",

  name: "readmission-rate",

  displayName: "Readmission Rate",

  description:
    "Returns the hospital readmission rate.",

 template: `
SELECT
  facility_id,
  measure_code,
  predicted_readmission_rate,
  expected_readmission_rate,
  excess_readmission_ratio
FROM warehouse_hospital_readmissions
WHERE facility_id = :hospitalId
ORDER BY measure_code;
`.trim(),

  type: "aggregation",

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
};