import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalListByOwnershipSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-list-by-ownership",

  name: "hospital-list-by-ownership",

  displayName: "Hospital List by Ownership",

  description:
    "Returns a list of hospitals filtered by ownership category.",

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
WHERE ownership LIKE 'Government%'
ORDER BY hospital_name ASC
LIMIT 100;
`.trim(),

  type: "lookup",

  parameters: [],

  deterministic: true,

  enabled: true,
};
