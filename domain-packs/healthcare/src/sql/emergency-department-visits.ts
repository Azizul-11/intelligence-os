import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const emergencyDepartmentVisitsSqlTemplate: SqlTemplateDefinition = {
  id: "emergency-department-visits",

  name: "emergency-department-visits",

  displayName: "Emergency Department Visits",

  description:
    "Returns emergency department visit statistics for a hospital.",

  template: `
SELECT emergency_department_visits
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