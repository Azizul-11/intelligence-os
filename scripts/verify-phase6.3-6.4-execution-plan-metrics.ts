/**
 * Phase 6.3 / 6.4 - ExecutionPlan.metrics[] Verification
 *
 * Runs the REAL end-to-end planning pipeline (semantic resolution ->
 * QueryPlanner.createPlan -> ExecutionPlanMapper.map) and asserts on the
 * resulting ExecutionPlan, per the Phase 6 verification requirements:
 * TEST 1 (single metric, backward compatible), TEST 2 (two metrics),
 * TEST 3 (reverse order), TEST 4 (state filter + two metrics),
 * TEST 5 (three metrics), TEST 6 (duplicate phrase dedup).
 *
 * TEST 7 (existing Phase 5 regression suite) is covered separately by
 * re-running scripts/verify-phase5.2-execution-mapping.ts unmodified
 * (see the accompanying implementation report for that evidence).
 *
 * NOTE ON QUERY PHRASING: per the reviewed decision recorded in
 * docs/PHASE_6.0_FIRST_CONTROLLED_PROOF.md, the task's literal example
 * phrasing ("best ratings") does not resolve against current Healthcare
 * alias data (only singular "rating" forms are registered) - that gap is
 * deliberately deferred, not fixed, in this phase. Tests below use the
 * adjusted phrasing ("best overall rating") confirmed clean in that
 * report's addendum, and TEST 4 uses "hospitals located in Texas" to
 * avoid a separate, pre-existing, unrelated alias collision ("hospitals
 * in" is itself a registered alias for an unrelated metric).
 *
 * NO SQL execution - planning only.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import type { ExecutionPlan } from "../packages/contracts/src/execution/execution-plan";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();

function plan(query: string): ExecutionPlan | null {
  const semanticResult = semantic.resolve(query);

  if (!semanticResult.resolved) {
    return null;
  }

  const planResult = planner.createPlan(semanticResult);

  if (!planResult.success || !planResult.plan) {
    return null;
  }

  return mapper.map(planResult.plan);
}

interface Result {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

const results: Result[] = [];

function check(id: string, description: string, pass: boolean, detail: string) {
  results.push({ id, description, pass, detail });
}

function metricEntry(executionPlan: ExecutionPlan, metricId: string) {
  return executionPlan.metrics?.find((m) => m.metric === metricId);
}

// TEST 1 - Existing single metric, backward compatible
{
  const query = "highest rated hospitals";
  const executionPlan = plan(query);

  const pass =
    !!executionPlan &&
    executionPlan.metric === "hospital-overall-rating" &&
    executionPlan.metrics === undefined &&
    executionPlan.ordering?.direction === "desc";

  check(
    "TEST 1",
    `Existing single metric ("${query}") - metric unchanged, metrics[] omitted`,
    pass,
    `metric=${executionPlan?.metric}, metrics=${JSON.stringify(executionPlan?.metrics)}, ordering=${JSON.stringify(executionPlan?.ordering)}`,
  );
}

// TEST 2 - Two metrics
{
  const query = "Which hospitals have the best overall rating and lowest mortality?";
  const executionPlan = plan(query);

  const rating = executionPlan && metricEntry(executionPlan, "hospital-overall-rating");
  const mortality = executionPlan && metricEntry(executionPlan, "mortality-rate");

  const pass =
    !!executionPlan &&
    executionPlan.metrics?.length === 2 &&
    rating?.direction === "desc" &&
    mortality?.direction === "asc" &&
    executionPlan.ordering === undefined;

  check(
    "TEST 2",
    `Two metrics ("${query}")`,
    pass,
    `metrics=${JSON.stringify(executionPlan?.metrics)}, primary metric=${executionPlan?.metric}, ordering=${JSON.stringify(executionPlan?.ordering)}`,
  );
}

// TEST 3 - Reverse order
{
  const query = "Which hospitals have the lowest mortality and best overall rating?";
  const executionPlan = plan(query);

  const rating = executionPlan && metricEntry(executionPlan, "hospital-overall-rating");
  const mortality = executionPlan && metricEntry(executionPlan, "mortality-rate");

  const pass =
    !!executionPlan &&
    executionPlan.metrics?.length === 2 &&
    mortality?.direction === "asc" &&
    rating?.direction === "desc" &&
    executionPlan.metric === "mortality-rate"; // mortality mentioned first -> preserved as primary

  check(
    "TEST 3",
    `Reverse order ("${query}") - same correct directions, order preserved`,
    pass,
    `metrics=${JSON.stringify(executionPlan?.metrics)}, primary metric=${executionPlan?.metric}`,
  );
}

// TEST 4 - State filter + two metrics
{
  const query = "Which hospitals located in Texas have the best overall rating and lowest mortality?";
  const executionPlan = plan(query);

  const rating = executionPlan && metricEntry(executionPlan, "hospital-overall-rating");
  const mortality = executionPlan && metricEntry(executionPlan, "mortality-rate");
  const stateFilter = executionPlan?.filters.find((f) => f.field === "state");

  const pass =
    !!executionPlan &&
    executionPlan.metrics?.length === 2 &&
    rating?.direction === "desc" &&
    mortality?.direction === "asc" &&
    stateFilter?.operator === "=" &&
    stateFilter?.value === "TX";

  check(
    "TEST 4",
    `State + two metrics ("${query}") - filter architecture unchanged`,
    pass,
    `metrics=${JSON.stringify(executionPlan?.metrics)}, filters=${JSON.stringify(executionPlan?.filters)}`,
  );
}

// TEST 5 - Three metrics
{
  const query = "Which hospitals have the best overall rating, lowest mortality, and lowest readmission?";
  const executionPlan = plan(query);

  const rating = executionPlan && metricEntry(executionPlan, "hospital-overall-rating");
  const mortality = executionPlan && metricEntry(executionPlan, "mortality-rate");
  const readmission = executionPlan && metricEntry(executionPlan, "readmission-rate");

  const pass =
    !!executionPlan &&
    executionPlan.metrics?.length === 3 &&
    rating?.direction === "desc" &&
    mortality?.direction === "asc" &&
    readmission?.direction === "asc";

  check(
    "TEST 5",
    `Three metrics ("${query}")`,
    pass,
    `metrics=${JSON.stringify(executionPlan?.metrics)}`,
  );
}

// TEST 6 - Duplicate semantic phrases must not create duplicate metrics[] entries
{
  // "hospital overall rating" and "overall rating" both independently match
  // registered aliases for the SAME canonical metric (hospital-overall-rating),
  // producing 2 raw candidates for it, alongside a genuinely distinct 2nd
  // metric (mortality-rate) - buildMetrics() must dedupe the former to 1.
  const query = "Which hospitals have the best hospital overall rating and lowest mortality?";
  const executionPlan = plan(query);

  const ratingEntries = executionPlan?.metrics?.filter((m) => m.metric === "hospital-overall-rating") ?? [];
  const mortalityEntries = executionPlan?.metrics?.filter((m) => m.metric === "mortality-rate") ?? [];

  const pass =
    !!executionPlan &&
    executionPlan.metrics?.length === 2 &&
    ratingEntries.length === 1 &&
    mortalityEntries.length === 1 &&
    ratingEntries[0]?.direction === "desc" &&
    mortalityEntries[0]?.direction === "asc";

  check(
    "TEST 6",
    `Duplicate semantic phrases dedup correctly ("${query}")`,
    pass,
    `metrics=${JSON.stringify(executionPlan?.metrics)}`,
  );
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 6.3 / 6.4 EXECUTION PLAN METRICS VERIFICATION");
console.log("=".repeat(80));

for (const r of results) {
  console.log(`\n[${r.id}] ${r.description}`);
  console.log(`  ${r.detail}`);
  console.log(r.pass ? "  ✅ PASS" : "  ❌ FAIL");
}

const total = results.length;
const passed = results.filter((r) => r.pass).length;

console.log("\n" + "=".repeat(80));
console.log(`Total: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${total - passed}`);
console.log("=".repeat(80));

if (passed !== total) {
  console.log("\n❌ PHASE 6.3 / 6.4 EXECUTION PLAN METRICS VERIFICATION: FAILED");
  process.exit(1);
} else {
  console.log("\n✅ PHASE 6.3 / 6.4 EXECUTION PLAN METRICS VERIFICATION: ALL TESTS PASSED");
}
