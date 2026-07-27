import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const mortalityRateSqlTemplate: SqlTemplateDefinition = {
  id: "mortality-rate",

  name: "mortality-rate",

  displayName: "Mortality Rate",

  description:
    "Returns the mortality rate for a specific hospital.",

  template: `
SELECT
  facility_id,
  measure_code,
  measure_name,
  score,
  compared_to_national,
  denominator,
  lower_estimate,
  higher_estimate
FROM warehouse_hospital_clinical_outcomes
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