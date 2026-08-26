import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingRankingSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating-ranking",

  name: "hospital-overall-rating-ranking",

  displayName: "Hospital Overall Rating Ranking",

  description:
    "Returns the highest rated hospitals.",

  template: `
SELECT
    facility_id,
    hospital_name,
    state,
    overall_rating
FROM warehouse_hospitals
WHERE
    overall_rating IS NOT NULL
    AND (
        :state IS NULL
        OR state = :state
    )
ORDER BY overall_rating :direction NULLS LAST
LIMIT 10;
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "state",
      type: "string",
      required: false,
      description: "Filter hospitals by state",
    },
    {
      name: "direction",
      type: "direction",
      required: false,
      description: "Sort direction: ASC or DESC (defaults to DESC)",
    },
  ],

  deterministic: true,

  enabled: true,
};