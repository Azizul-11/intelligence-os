import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const readmissionRateRankingBenchmarkSqlTemplate: SqlTemplateDefinition = {
  id: "readmission-rate-ranking-benchmark",

  name: "readmission-rate-ranking-benchmark",

  displayName: "Readmission Performance Above/Below Benchmark",

  description:
    "RCG-009: hospitals whose readmission performance (readm_measures_better, the same primary ranking column established for readmission-rate-ranking) is above or below a benchmark reference value. :benchmark is the opaque canonical id resolved by Universal Core - Healthcare interprets it here. A \"national-average\" (or any other non-state-scoped) benchmark is always computed over the whole warehouse (ratified Decision 4). A \"state-average\" benchmark is computed only over the same state already being filtered to (ratified Decision 5) - this template is never selected without a resolved :state when the benchmark is state-scoped.",

  template: `
WITH bench AS (
    SELECT avg(readm_measures_better::numeric) AS benchmark_value
    FROM warehouse_hospitals
    WHERE
        facility_readm_measure_count > 0
        AND (
            :benchmark != 'state-average'
            OR state = :state
        )
)
SELECT
    h.facility_id,
    h.hospital_name,
    h.state,
    h.readm_measures_better,
    h.readm_measures_no_different,
    h.readm_measures_worse,
    h.facility_readm_measure_count
FROM warehouse_hospitals h, bench
WHERE
    h.facility_readm_measure_count > 0
    AND (
        :state IS NULL
        OR h.state = :state
    )
    AND (
        CASE WHEN :comparison = 'below'
            THEN h.readm_measures_better::numeric < bench.benchmark_value
            ELSE h.readm_measures_better::numeric > bench.benchmark_value
        END
    )
ORDER BY
    CASE WHEN :direction = 'ASC' THEN h.readm_measures_worse ELSE h.readm_measures_better END DESC NULLS LAST,
    CASE WHEN :direction = 'ASC' THEN h.readm_measures_better ELSE h.readm_measures_worse END ASC NULLS LAST
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
      type: "string",
      required: false,
      description:
        "DESC (default): best-first among the filtered set, ranked by most measures better-than-national, tied hospitals broken by fewest worse-than-national. ASC: worst-first - primary/tiebreak columns swap. Declared as type \"string\" (compared in a CASE expression, not used as a bare ORDER BY keyword).",
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
