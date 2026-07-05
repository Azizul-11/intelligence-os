import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const patientExperienceSqlTemplate: SqlTemplateDefinition = {
  id: "patient-experience",

  name: "patient-experience",

  displayName: "Patient Experience",

  description:
    "Returns patient experience metrics for a hospital.",

  template: `
SELECT patient_experience_score
FROM hospital_metrics
WHERE hospital_id = :hospitalId;
`.trim(),

  type: "summary",

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