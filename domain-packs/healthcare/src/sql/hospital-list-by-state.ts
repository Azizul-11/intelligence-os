import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalListByStateSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-list-by-state",

  name: "hospital-list-by-state",

  displayName: "Hospital List by State",

  description:
    "Returns a list of hospitals in one or more specific states. Tier1 Task 5 balanced-limits fix: single-state request keeps a sensible ceiling of 100; a multi-state request returns up to 50 PER named state (ROW_NUMBER() OVER PARTITION BY state) so a state with disproportionately more hospitals (e.g. alphabetically-earlier California) can't crowd another named state out of the ceiling entirely.",

  template: `
WITH ranked_facilities AS (
    SELECT
        facility_id,
        hospital_name,
        city,
        state,
        county,
        hospital_type,
        ownership,
        overall_rating,
        emergency_services,
        ROW_NUMBER() OVER (
            PARTITION BY (CASE WHEN :multiState = true THEN state ELSE 'ALL' END)
            ORDER BY hospital_name ASC
        ) AS rank_within_scope
    FROM warehouse_hospitals
    WHERE UPPER(state) IN (:states)
      AND (:county IS NULL OR UPPER(county) = UPPER(:county))
      AND (:city IS NULL OR UPPER(city) = UPPER(:city))
      AND (:ownership IS NULL OR UPPER(ownership) LIKE UPPER(:ownership))
      AND (:overallRating IS NULL OR overall_rating = :overallRating)
)
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
FROM ranked_facilities
WHERE
    (:multiState = true AND rank_within_scope <= 50)
    OR (:multiState = false AND rank_within_scope <= 100)
ORDER BY state ASC, hospital_name ASC
`.trim(),

  type: "lookup",

  parameters: [
    {
      name: "states",
      type: "array",
      required: true,
      description: "Tier1 Task 5: state(s) to list hospitals from - HealthcareParameterResolver always wraps a single resolved state into a 1-element array here, so this alone (not a separate scalar `state` parameter) is what guards against a scope-less request (e.g. bare \"show hospitals\", with no place named at all) reaching this template with an unbounded, nationwide query.",
    },
    {
      name: "multiState",
      type: "boolean",
      required: false,
      description: "Tier1 Task 5 balanced-limits fix: true when 2+ states were resolved - gates the per-state ceiling (50/state) vs. the single-state ceiling (100).",
    },
    {
      name: "county",
      type: "string",
      required: false,
      description: "Filter hospitals by county (Pre-Phase 9 Tier0 Task 1)",
    },
    {
      name: "city",
      type: "string",
      required: false,
      description: "Filter hospitals by city (Pre-Phase 9 Tier0 Task 1)",
    },
    {
      name: "ownership",
      type: "string",
      required: false,
      description: "Filter hospitals by ownership category, as a SQL LIKE pattern (Pre-Phase 9 Tier0 Task 5)",
    },
    {
      name: "overallRating",
      type: "string",
      required: false,
      description: "Filter hospitals by exact overall_rating value 1-5 (Pre-Phase 9 Tier1 Task 2)",
    },
  ],

  deterministic: true,

  enabled: true,
};
