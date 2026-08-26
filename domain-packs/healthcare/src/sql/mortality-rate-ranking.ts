import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const mortalityRateRankingSqlTemplate: SqlTemplateDefinition = {
  id: "mortality-rate-ranking",

  name: "mortality-rate-ranking",

  displayName: "Mortality Performance Ranking",

  description:
    "Returns hospitals with best mortality performance based on CMS measure classifications (count of measures better than national average).",

  template: `
SELECT
    h.facility_id,
    h.hospital_name,
    h.state,
    h.mort_measures_better,
    h.mort_measures_no_different,
    h.mort_measures_worse,
    h.facility_mort_measure_count
FROM warehouse_hospitals h
WHERE
    h.facility_mort_measure_count > 0
    AND (
        :state IS NULL
        OR h.state = :state
    )
ORDER BY
    CASE WHEN :direction = 'ASC' THEN h.mort_measures_worse ELSE h.mort_measures_better END DESC NULLS LAST,
    CASE WHEN :direction = 'ASC' THEN h.mort_measures_better ELSE h.mort_measures_worse END ASC NULLS LAST
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
      type: "string",
      required: false,
      description:
        "DESC (default): best performance first, ranked by most measures better-than-national, tied hospitals broken by fewest worse-than-national. ASC: worst performance first - the primary and tiebreak columns swap (most measures worse-than-national first, tied hospitals broken by fewest better-than-national), not merely a reversed sort of the DESC ordering. Declared as type \"string\" (compared against a literal in the ORDER BY CASE expression below), not type \"direction\" - this template never uses :direction as a bare trailing ORDER BY keyword, so the RCG-019 bare-keyword rendering does not apply here.",
    },
  ],

  deterministic: true,

  enabled: true,
};
