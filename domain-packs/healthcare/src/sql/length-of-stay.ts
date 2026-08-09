import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const lengthOfStaySqlTemplate: SqlTemplateDefinition = {
  id: "length-of-stay-aggregation",

  name: "length-of-stay-aggregation",

  displayName: "Length of Stay",

  description:
    "Returns the average hospital length of stay.",

  template: `
SELECT average_length_of_stay
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