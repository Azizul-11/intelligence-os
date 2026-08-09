import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalListByStateSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-list-by-state",

  name: "hospital-list-by-state",

  displayName: "Hospital List by State",

  description:
    "Returns a list of hospitals in a specific state.",

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
WHERE state = :state
ORDER BY hospital_name ASC
LIMIT 100;
`.trim(),

  type: "lookup",

  parameters: [
    {
      name: "state",
      type: "string",
      required: true,
      description: "State to list hospitals from",
    },
  ],

  deterministic: true,

  enabled: true,
};
