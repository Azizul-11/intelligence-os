import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const mortalityRateSqlTemplate: SqlTemplateDefinition = {
  id: "mortality-rate",

  name: "mortality-rate",

  displayName: "Mortality Rate",

  description:
    "Returns the mortality rate for a specific hospital.",

  template: `
SELECT mortality_rate
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