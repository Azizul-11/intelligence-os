import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating",

  name: "hospital-overall-rating",

  displayName: "Hospital Overall Rating",

  description:
    "Returns the overall CMS hospital rating for a specific hospital.",

template: `
SELECT
  facility_id,
  hospital_name,
  overall_rating
FROM warehouse_hospitals
WHERE facility_id = :hospitalId;
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

  // Phase 8.6B: the only filter is the hospital identity from warehouse_hospitals, so a resolved hospital never yields zero rows; opted in for consistency (inert here).
  singleEntityRecord: true,
};