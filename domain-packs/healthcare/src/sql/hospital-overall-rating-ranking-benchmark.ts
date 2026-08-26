import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalOverallRatingRankingBenchmarkSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-overall-rating-ranking-benchmark",

  name: "hospital-overall-rating-ranking-benchmark",

  displayName: "Hospital Overall Rating Ranking Above/Below Benchmark",

  description:
    "RCG-009: hospitals whose overall rating is above or below a benchmark reference value. :benchmark is the opaque canonical id resolved by Universal Core (e.g. \"national-average\", \"state-average\") - Healthcare interprets it here to decide the benchmark's computation scope. A \"national-average\" (or any other non-state-scoped) benchmark is always computed over the whole warehouse (ratified Decision 4), never narrowed by a co-occurring state filter. A \"state-average\" benchmark is computed only over the same state already being filtered to (ratified Decision 5) - this template is never selected without a resolved :state when the benchmark is state-scoped (see HealthcareExecutionStrategy).",

  template: `
WITH bench AS (
    SELECT avg(overall_rating::numeric) AS benchmark_value
    FROM warehouse_hospitals
    WHERE
        overall_rating IS NOT NULL
        AND (
            :benchmark != 'state-average'
            OR state = :state
        )
)
SELECT
    h.facility_id,
    h.hospital_name,
    h.state,
    h.overall_rating
FROM warehouse_hospitals h, bench
WHERE
    h.overall_rating IS NOT NULL
    AND (
        :state IS NULL
        OR h.state = :state
    )
    AND (
        CASE WHEN :comparison = 'below'
            THEN h.overall_rating::numeric < bench.benchmark_value
            ELSE h.overall_rating::numeric > bench.benchmark_value
        END
    )
ORDER BY h.overall_rating :direction NULLS LAST
LIMIT 10;
`.trim(),

  type: "ranking",

  parameters: [
    {
      name: "state",
      type: "string",
      required: false,
      description: "Optional state filter for the result set (and, when the benchmark is state-scoped, the benchmark's own computation scope)",
    },
    {
      name: "direction",
      type: "direction",
      required: false,
      description: "Sort direction for the filtered result set: ASC or DESC (defaults to DESC)",
    },
    {
      name: "benchmark",
      type: "string",
      required: true,
      description: "Opaque benchmark canonical id (e.g. \"national-average\", \"state-average\") resolved by Universal Core - not interpreted there, only here",
    },
    {
      name: "comparison",
      type: "string",
      required: true,
      description: "\"above\" or \"below\" - which side of the benchmark to return",
    },
  ],

  deterministic: true,

  enabled: true,
};
