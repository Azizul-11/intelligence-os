import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalCountByStateSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-count-by-state",

  name: "hospital-count-by-state",

  displayName: "Hospital Count by State",

  description:
    "Returns the count of hospitals in a specific state.",

  template: `
SELECT
    state,
    COUNT(*) as hospital_count
FROM warehouse_hospitals
WHERE state = :state
GROUP BY state;
`.trim(),

  type: "aggregation",

  parameters: [
    {
      name: "state",
      type: "string",
      required: true,
      description: "State to count hospitals in",
    },
  ],

  deterministic: true,

  enabled: true,
};
