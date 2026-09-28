import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalCountByCountySqlTemplate: SqlTemplateDefinition = {
  id: "hospital-count-by-county",

  name: "hospital-count-by-county",

  displayName: "Hospital Count by County",

  description:
    "Returns the count of hospitals in a specific county. Bug fix (2026-09-28): `county` alone is NOT enough - " +
    "a same-named county in another state (Cook County: GA/IL/MN) is refused for clarification first, but the " +
    "user's chosen state then arrives as its OWN resolved value; a template with no `state` parameter to declare " +
    "silently ignored it and summed every state's Cook County together. `state` is required, same reasoning as " +
    "hospital-overall-rating-ranking-by-county.ts's own required `:state` (RCG-008 Decision 2): county is " +
    "high-cardinality and genuinely collides across states, so it must always be bounded. A single-state county " +
    "(e.g. Harris, TX-only) still works unchanged - parameter-resolver.ts's singleStateOfGeography() already " +
    "derives `state` automatically whenever a county resolves to exactly one.",

  template: `
SELECT
    county,
    state,
    COUNT(*) as hospital_count
FROM warehouse_hospitals
WHERE county = :county
    AND state = :state
GROUP BY county, state;
`.trim(),

  type: "aggregation",

  parameters: [
    {
      name: "county",
      type: "string",
      required: true,
      description: "County to count hospitals in",
    },
    {
      name: "state",
      type: "string",
      required: true,
      description: "Required bounding state filter - county is high-cardinality and collides across states (RCG-008 Decision 2)",
    },
  ],

  deterministic: true,

  enabled: true,
};
