import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingRankingByCountySqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating-ranking-by-county",

  name: "hospital-overall-rating-ranking-by-county",

  displayName: "Hospital Overall Rating Ranking By County",

  description:
    "RCG-008: the single highest-rated hospital within each county (ratified Decision 1: top 1 per group, hardcoded). County is high-cardinality (1,555 distinct values in the real warehouse) - ratified Decision 2 requires a bounding state filter; this template's own :state parameter is required, and the execution strategy never selects this template without one already resolved.",

  template: `
SELECT
    facility_id,
    hospital_name,
    state,
    county,
    overall_rating
FROM (
    SELECT
        facility_id,
        hospital_name,
        state,
        county,
        overall_rating,
        ROW_NUMBER() OVER (
            PARTITION BY county
            ORDER BY overall_rating DESC NULLS LAST
        ) AS rn
    FROM warehouse_hospitals
    WHERE
        overall_rating IS NOT NULL
        AND county IS NOT NULL
        AND state = :state
) ranked
WHERE rn <= 1
ORDER BY county;
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "state",
      type: "string",
      required: true,
      description: "Required bounding state filter (RCG-008 Decision 2: county grouping is high-cardinality and must be bounded)",
    },
  ],

  deterministic: true,

  enabled: true,
};
