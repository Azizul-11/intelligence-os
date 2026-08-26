import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const safetyPerformanceRankingBenchmarkSqlTemplate: SqlTemplateDefinition = {
  id: "safety-performance-ranking-benchmark",

  name: "safety-performance-ranking-benchmark",

  displayName: "Safety Performance Above/Below Benchmark",

  description:
    "RCG-009: hospitals whose safety performance is above or below a benchmark reference value. The comparison basis is safety_score - the same normalized percentage (safety_measures_better / facility_safety_measure_count * 100) already established as the metric's primary ranking value by safety-performance-ranking.ts - not the raw safety_measures_better count, since \"safety performance\" represents normalized performance rather than a raw positive-measure count. :benchmark is the opaque canonical id resolved by Universal Core - Healthcare interprets it here. A \"national-average\" (or any other non-state-scoped) benchmark is always computed over the whole warehouse (ratified Decision 4). A \"state-average\" benchmark is computed only over the same state already being filtered to (ratified Decision 5) - this template is never selected without a resolved :state when the benchmark is state-scoped (see HealthcareExecutionStrategy).",

  template: `
WITH bench AS (
    SELECT avg(
        ROUND(
            (safety_measures_better::numeric / facility_safety_measure_count::numeric) * 100,
            2
        )
    ) AS benchmark_value
    FROM warehouse_hospitals
    WHERE
        facility_safety_measure_count > 0
        AND (
            :benchmark != 'state-average'
            OR state = :state
        )
)
SELECT
    h.facility_id,
    h.hospital_name,
    h.state,
    h.safety_measures_better,
    h.safety_measures_no_different,
    h.safety_measures_worse,
    h.facility_safety_measure_count,
    ROUND(
        (h.safety_measures_better::numeric / h.facility_safety_measure_count::numeric) * 100,
        2
    ) AS safety_score
FROM warehouse_hospitals h, bench
WHERE
    h.facility_safety_measure_count > 0
    AND (
        :state IS NULL
        OR h.state = :state
    )
    AND (
        CASE WHEN :comparison = 'below'
            THEN ROUND((h.safety_measures_better::numeric / h.facility_safety_measure_count::numeric) * 100, 2) < bench.benchmark_value
            ELSE ROUND((h.safety_measures_better::numeric / h.facility_safety_measure_count::numeric) * 100, 2) > bench.benchmark_value
        END
    )
ORDER BY
    ROUND((h.safety_measures_better::numeric / h.facility_safety_measure_count::numeric) * 100, 2) :direction NULLS LAST,
    h.hospital_name ASC
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
      description: "Sort direction for the filtered result set by safety_score: ASC or DESC (defaults to DESC), matching the ordering convention already established by safety-performance-ranking.ts",
    },
    {
      name: "benchmark",
      type: "string",
      required: true,
      description: "Opaque benchmark canonical id (e.g. \"national-average\", \"median\", \"state-average\") resolved by Universal Core - not interpreted there, only here",
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
