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

  // Phase 8.6B: this template's only filter is the requested hospital's
  // own identity, and a non-empty result is exclusively that hospital's
  // own measures - a zero-row result genuinely means this hospital has
  // no readmissions data, not merely that some other filter matched
  // nothing.
  singleEntityRecord: true,
};