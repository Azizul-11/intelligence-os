import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

/**
 * Batch 5B-4: a list of hospitals with no state named ("rural emergency hospitals", "which hospitals offer emergency
 * services?"). hospital-list-by-state requires `states`, which is what keeps a bare "show hospitals" from listing all
 * 5,442; this template keeps the same safety rule a different way: it is only selected when a hospital-type or flag
 * filter is present (runtime/execution-strategy.ts), its WHERE clause matches nothing unless one is bound, and it
 * returns at most 100 rows (alphabetical). When more match, the answer says how many (hospital-attribute-directory.ts).
 */
export const hospitalListNationwideSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-list-nationwide",

  name: "hospital-list-nationwide",

  displayName: "Hospital List Nationwide",

  description:
    "Returns up to 100 hospitals nationwide (alphabetical) matching a hospital-type, emergency-services or birthing-friendly filter; never runs unfiltered.",

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
WHERE
    (:hospitalType IS NOT NULL OR :emergencyServices IS NOT NULL OR :birthingFriendly IS NOT NULL)
    AND (:hospitalType IS NULL OR UPPER(hospital_type) LIKE UPPER(:hospitalType))
    AND (:emergencyServices IS NULL OR emergency_services = CAST(:emergencyServices AS BOOLEAN))
    AND (:birthingFriendly IS NULL OR birthing_friendly = :birthingFriendly)
    AND (:ownership IS NULL OR UPPER(ownership) LIKE UPPER(:ownership))
    AND (:overallRating IS NULL OR overall_rating = :overallRating)
ORDER BY hospital_name ASC, state ASC
LIMIT 100
`.trim(),

  type: "lookup",

  parameters: [
    {
      name: "hospitalType",
      type: "string",
      required: false,
      description: "Filter by hospital_type, as a SQL LIKE pattern",
    },
    {
      name: "emergencyServices",
      type: "string",
      required: false,
      description: "'true' keeps only hospitals that provide emergency services",
    },
    {
      name: "birthingFriendly",
      type: "string",
      required: false,
      description: "'Y' keeps only CMS Birthing-Friendly hospitals",
    },
    {
      name: "ownership",
      type: "string",
      required: false,
      description: "Filter hospitals by ownership category, as a SQL LIKE pattern",
    },
    {
      name: "overallRating",
      type: "string",
      required: false,
      description: "Filter hospitals by exact overall_rating value 1-5",
    },
  ],

  deterministic: true,

  enabled: true,
};
