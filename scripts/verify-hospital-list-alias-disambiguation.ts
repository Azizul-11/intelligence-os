/**
 * Semantic disambiguation fix: "hospitals in <place>" alias collision.
 *
 * Root cause: "hospitals in" is a registered alias for the hospital-list
 * metric (rankable: false). Because phrase extraction is exhaustive, this
 * bigram matched inside any sentence containing it - including ranking
 * queries like "Which hospitals in Texas have the best overall rating and
 * lowest mortality?" - producing a spurious extra metric with no ranking
 * template, which failed the whole request under Phase 7's strict
 * failure semantics.
 *
 * Fix: QueryPlanner now excludes non-rankable metric candidates from a
 * "ranking"-intent plan ONLY when at least one other candidate in the
 * same query IS rankable (MetricDefinition.rankable, already-existing,
 * domain-agnostic metadata). A standalone non-rankable query is
 * completely unaffected.
 *
 * Exercises the real pipeline: Semantic -> QueryPlanner -> ExecutionPlanMapper.
 * No SQL execution - planning only, matching the scope of this fix.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();

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

function planFor(query: string) {
  const semanticResult = semantic.resolve(query);
  const planResult = planner.createPlan(semanticResult);
  if (!planResult.success || !planResult.plan) {
    return null;
  }
  return {
    metrics: planResult.plan.semantic.metrics.map((m) => m.canonicalKey),
    intent: planResult.plan.intent,
    executionPlan: mapper.map(planResult.plan),
  };
}

// 1. The originally-failing query
{
  const query = "Which hospitals in Texas have the best overall rating and lowest mortality?";
  const plan = planFor(query);
  const pass =
    !!plan &&
    plan.metrics.length === 2 &&
    plan.metrics.includes("hospital-overall-rating") &&
    plan.metrics.includes("mortality-rate") &&
    !plan.metrics.includes("hospital-list") &&
    plan.executionPlan.metrics?.find((m) => m.metric === "hospital-overall-rating")?.direction === "desc" &&
    plan.executionPlan.metrics?.find((m) => m.metric === "mortality-rate")?.direction === "asc";
  check("1", `Originally-failing query resolves to exactly the 2 intended metrics ("${query}")`, pass, `metrics=${JSON.stringify(plan?.metrics)}`);
}

// 2. Generalizes to a different state (California), not just Texas
{
  const query = "Which hospitals in California have the best overall rating and lowest mortality?";
  const plan = planFor(query);
  const pass =
    !!plan &&
    plan.metrics.length === 2 &&
    plan.metrics.includes("hospital-overall-rating") &&
    plan.metrics.includes("mortality-rate") &&
    !plan.metrics.includes("hospital-list");
  check("2", `Generalizes to California, not a Texas-specific patch ("${query}")`, pass, `metrics=${JSON.stringify(plan?.metrics)}`);
}

// 3. Reverse metric order, same collision phrase
{
  const query = "Which hospitals in Texas have the lowest mortality and best overall rating?";
  const plan = planFor(query);
  const pass =
    !!plan &&
    plan.metrics.length === 2 &&
    plan.metrics[0] === "mortality-rate" &&
    plan.metrics[1] === "hospital-overall-rating" &&
    !plan.metrics.includes("hospital-list") &&
    plan.executionPlan.metric === "mortality-rate";
  check("3", `Reverse metric order still resolves correctly, order preserved ("${query}")`, pass, `metrics=${JSON.stringify(plan?.metrics)}`);
}

// 4. Pre-existing standalone hospital-list capability (Phase 5-era
// expectation, scripts/audit-phase5-runtime.ts Q2) must remain intact.
{
  const query = "hospitals in California";
  const plan = planFor(query);
  const pass =
    !!plan &&
    plan.metrics.length === 1 &&
    plan.metrics[0] === "hospital-list" &&
    plan.intent === "lookup" &&
    plan.executionPlan.metric === "hospital-list" &&
    plan.executionPlan.metrics === undefined;
  check("4", `Pre-existing standalone hospital-list query unaffected ("${query}")`, pass, `metrics=${JSON.stringify(plan?.metrics)}, intent=${plan?.intent}`);
}

// 5. Ordinary hospital-list query with an explicit verb, with a state -
// legitimate hospital-list intent must not be weakened.
{
  const query = "show hospitals in Texas";
  const plan = planFor(query);
  const pass =
    !!plan &&
    plan.metrics.every((m) => m === "hospital-list") &&
    plan.intent === "lookup" &&
    plan.executionPlan.metric === "hospital-list";
  check("5", `Ordinary hospital-list query ("${query}") still resolves correctly`, pass, `metrics=${JSON.stringify(plan?.metrics)}, intent=${plan?.intent}`);
}

// 6. Pre-existing single-metric ranking (Q1/Q4) unaffected
{
  const q1 = planFor("highest rated hospitals");
  const q4 = planFor("highest rated hospitals in California");
  const pass =
    !!q1 && q1.executionPlan.metric === "hospital-overall-rating" && q1.executionPlan.metrics === undefined &&
    !!q4 && q4.executionPlan.metric === "hospital-overall-rating" && q4.executionPlan.metrics === undefined;
  check("6", "Pre-existing single-metric ranking queries (Q1/Q4) unaffected", pass, `q1.metric=${q1?.executionPlan.metric}, q4.metric=${q4?.executionPlan.metric}`);
}

// 7. Pre-existing aggregation query (Q3) unaffected
{
  const query = "how many hospitals are in California";
  const plan = planFor(query);
  const pass = !!plan && plan.metrics[0] === "hospital-count" && plan.intent === "aggregation";
  check("7", `Pre-existing aggregation query unaffected ("${query}")`, pass, `metrics=${JSON.stringify(plan?.metrics)}, intent=${plan?.intent}`);
}

console.log("\n" + "=".repeat(80));
console.log("HOSPITAL-LIST ALIAS DISAMBIGUATION VERIFICATION");
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
  console.log("\n❌ HOSPITAL-LIST ALIAS DISAMBIGUATION VERIFICATION: FAILED");
  process.exit(1);
} else {
  console.log("\n✅ HOSPITAL-LIST ALIAS DISAMBIGUATION VERIFICATION: ALL TESTS PASSED");
}
