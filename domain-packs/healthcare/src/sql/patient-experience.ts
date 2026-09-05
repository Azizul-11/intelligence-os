import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const patientExperienceSqlTemplate: SqlTemplateDefinition = {
  id: "patient-experience",

  name: "patient-experience",

  displayName: "Patient Experience",

  description:
    "Returns patient experience metrics for a hospital.",

template: `
SELECT
  facility_id,
  measure_code,
  question,
  answer_description,
  patient_survey_star_rating,
  answer_percent,
  linear_mean_value,
  completed_surveys,
  survey_response_rate_percent
FROM warehouse_hospital_hcahps
WHERE facility_id = :hospitalId
ORDER BY measure_code;
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

  // Phase 8.6B: this template's only filter is the requested hospital's
  // own identity, and a non-empty result is exclusively that hospital's
  // own measures - a zero-row result genuinely means this hospital has
  // no HCAHPS data, not merely that some other filter matched nothing.
  singleEntityRecord: true,
};