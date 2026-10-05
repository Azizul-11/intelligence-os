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
  AND (:measureCode IS NULL OR measure_code = :measureCode)
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
    {
      name: "measureCode",
      type: "string",
      required: false,
      description: "Optional CMS condition-specific measure code (Tier0 Task 5) - scopes the result to one named condition instead of every measure this hospital reports.",
    },
  ],

  deterministic: true,

  enabled: true,

  // Phase 8.6B: the only filter is the hospital identity, so a zero-row result genuinely means no readmissions data, not another filter matching nothing.
  singleEntityRecord: true,
};