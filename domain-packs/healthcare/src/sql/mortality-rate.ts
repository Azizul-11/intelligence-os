import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const mortalityRateSqlTemplate: SqlTemplateDefinition = {
  id: "mortality-rate",

  name: "mortality-rate",

  displayName: "Mortality Rate",

  description:
    "Returns the mortality rate for a specific hospital. Batch 3: with no condition named (`:measureCode` NULL) it returns the mortality family only (the 30-day MORT_* measures and the hip/knee complications measure the hip/knee concept files under mortality); before, `Mayo Clinic mortality rate` returned the hospital's first 20 measures alphabetically, including safety indicators.",

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
  AND (
    (:measureCode IS NULL AND (measure_code LIKE 'MORT%' OR measure_code = 'COMP_HIP_KNEE'))
    OR measure_code = :measureCode
  )
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

  // Phase 8.6B: this template's only filter is the requested hospital's
  // own identity, and a non-empty result is exclusively that hospital's
  // own measures - a zero-row result genuinely means this hospital has
  // no clinical-outcomes data, not merely that some other filter
  // matched nothing.
  singleEntityRecord: true,
};