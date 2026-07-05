import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const readmissionRateSqlTemplate: SqlTemplateDefinition = {
  id: "readmission-rate",

  name: "readmission-rate",

  displayName: "Readmission Rate",

  description:
    "Returns the hospital readmission rate.",

  template: `
SELECT readmission_rate
FROM hospital_metrics
WHERE hospital_id = :hospitalId;
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