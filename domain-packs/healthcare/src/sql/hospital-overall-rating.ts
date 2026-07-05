import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating",

  name: "hospital-overall-rating",

  displayName: "Hospital Overall Rating",

  description:
    "Returns the overall CMS hospital rating for a specific hospital.",

  template: `
SELECT overall_rating
FROM hospital_metrics
WHERE hospital_id = :hospitalId;
`.trim(),

  type: "lookup",

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