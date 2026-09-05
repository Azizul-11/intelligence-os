import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalDetailSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-detail",

  name: "hospital-detail",

  displayName: "Hospital Detail",

  description:
    "Returns identity/profile information for a single hospital - the same deterministic column set already used by hospital-list-by-state, filtered to one facility instead of one state.",

  template: `
SELECT
    facility_id,
    hospital_name,
    city,
    state,
    county,
    hospital_type,
    ownership,
    overall_rating,
    emergency_services
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
