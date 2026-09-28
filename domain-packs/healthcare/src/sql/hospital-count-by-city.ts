import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalCountByCitySqlTemplate: SqlTemplateDefinition = {
  id: "hospital-count-by-city",

  name: "hospital-count-by-city",

  displayName: "Hospital Count by City",

  description:
    "Returns the count of hospitals in a specific city. Same bug fix as hospital-count-by-county.ts (2026-09-28): " +
    "a same-named city in another state (Houston: MO/MS/TX) is refused for clarification first, but the user's " +
    "chosen state then arrives as its own resolved value; `city` alone had no `state` parameter to declare it, so " +
    "it was silently ignored and every matching city across every state got summed together. `state` is required " +
    "for the same reason hospital-overall-rating-ranking-by-county.ts's own `:state` is (RCG-008 Decision 2). A " +
    "single-state city (e.g. Chicago, IL-only) still works unchanged - parameter-resolver.ts's " +
    "singleStateOfGeography() already derives `state` automatically whenever a city resolves to exactly one.",

  template: `
SELECT
    city,
    state,
    COUNT(*) as hospital_count
FROM warehouse_hospitals
WHERE city = :city
    AND state = :state
GROUP BY city, state;
`.trim(),

  type: "aggregation",

  parameters: [
    {
      name: "city",
      type: "string",
      required: true,
      description: "City to count hospitals in",
    },
    {
      name: "state",
      type: "string",
      required: true,
      description: "Required bounding state filter - a city name can collide across states (e.g. Houston: MO/MS/TX)",
    },
  ],

  deterministic: true,

  enabled: true,
};
