import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingRankingByStateSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating-ranking-by-state",

  name: "hospital-overall-rating-ranking-by-state",

  displayName: "Hospital Overall Rating Ranking By State",

  description:
    "RCG-008: the single highest-rated hospital within each state (ratified Decision 1: top 1 per group, hardcoded - not user-configurable). State is low-cardinality (56 distinct values) and requires no bounding filter (ratified Decision 2).",

  template: `
SELECT
    facility_id,
    hospital_name,
    state,
    overall_rating
FROM (
    SELECT
        facility_id,
        hospital_name,
        state,
        overall_rating,
        ROW_NUMBER() OVER (
            PARTITION BY state
            ORDER BY overall_rating DESC NULLS LAST
        ) AS rn
    FROM warehouse_hospitals
    WHERE overall_rating IS NOT NULL
) ranked
WHERE rn <= 1
ORDER BY state;
`.trim(),

  type: "ranking",

  parameters: [],

  deterministic: true,

  enabled: true,
};
