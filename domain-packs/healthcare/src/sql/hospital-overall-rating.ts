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

  // Phase 8.6B: this template's only filter is the requested hospital's
  // own identity in `warehouse_hospitals` - the same table entity
  // resolution itself uses, so a validly-resolved hospital can never
  // actually produce zero rows here. Opted in for consistency (safe,
  // though effectively inert for this specific template).
  singleEntityRecord: true,
};