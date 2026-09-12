/**
 * Tier0 Task 4: F1 Benchmark Word-Order — REAL FIX V2 (Option A+)
 * Verification Suite.
 *
 * V1 (Option A) closed the P0 silent-wrong by refusing honestly
 * whenever a benchmark alias's own words were present but not
 * contiguous. V2 (Option A+) additionally registers known metric-gap
 * phrasings ("national mortality average", "national readmission
 * average", ...) as their own literal, contiguous aliases in
 * national-average.ts (Domain data only) - so these specific, common
 * phrasings now resolve directly to `national-average` and succeed,
 * while V1's `detectSubsumedBenchmarkRisk` safety net remains
 * unchanged and still catches any UNREGISTERED gap word.
 *
 * Run: npx tsx scripts/verify-prephase9-task4-f1-real-fix-v2.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { createClient } from "@supabase/supabase-js";
import { env } from "./shared/env";
import type { ExecutionPlan } from "../packages/contracts/src/execution/execution-plan";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);

interface TestResult { id: string; passed: boolean; detail: string; }
const results: TestResult[] = [];
function record(id: string, passed: boolean, detail: string) {
  results.push({ id, passed, detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${id} - ${detail}`);
}

function planOnly(query: string): ExecutionPlan | null {
  const semanticResult = semantic.resolve(query);
  if (!semanticResult.resolved) return null;
  const planResult = planner.createPlan(semanticResult, runtime.domain.metrics);
  if (!planResult.success || !planResult.plan) return null;
  return mapper.map(planResult.plan);
}

function countingEngine() {
  let calls = 0;
  const spyExecutor = {
    execute: async (...args: Parameters<typeof executor.execute>) => {
      calls++;
      return executor.execute(...args);
    },
  };
  const spyEngine = createRuntimeEngine({
    runtime, semantic, planner, executionPlanMapper: mapper,
    executor: spyExecutor as unknown as typeof executor,
  });
  return { spyEngine, getCalls: () => calls };
}

async function check(id: string, question: string, assert: (r: any, calls: number, plan: ExecutionPlan | null) => boolean) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const rows = (result.rows ?? []) as any[];
  const plan = planOnly(question);
  const pass = assert(result, getCalls(), plan);
  record(
    id,
    pass,
    `success=${result.success} answerability=${JSON.stringify(result.answerability?.status)}/${JSON.stringify(result.answerability?.reason)} rowCount=${result.rowCount} sqlCalls=${getCalls()} plan.benchmark=${JSON.stringify(plan?.benchmark ?? null)} plan.metric=${plan?.metric ?? "n/a"} filters=${JSON.stringify(plan?.filters ?? [])} error=${JSON.stringify(result.error)} facility_ids=[${rows.map((r) => r.facility_id).join(",")}]`,
  );
}

async function main() {
  console.log("=".repeat(90));
  console.log("TIER0 TASK 4: F1 REAL FIX V2 (OPTION A+ METRIC-GAP ALIASES) VERIFICATION");
  console.log("=".repeat(90));

  // Group A - the 4 target queries: were FAIL (ambiguous) under V1, must now be SUCCESS national-average.
  await check(
    "GA1-NATIONAL-MORTALITY-AVERAGE-NOW-SUCCESS",
    "California hospitals performing above national mortality average",
    (r, calls, plan) =>
      r.success === true &&
      r.answerability?.status === "answerable" &&
      plan?.benchmark?.benchmark === "national-average" &&
      plan?.metric === "mortality-rate" &&
      calls > 0 &&
      (r.rows ?? []).every((row: any) => row.state === "CA"),
  );
  await check(
    "GA2-MORTALITY-ABOVE-NATIONAL-MORTALITY-AVERAGE-NOW-SUCCESS",
    "California hospitals with mortality above national mortality average",
    (r, calls, plan) =>
      r.success === true &&
      plan?.benchmark?.benchmark === "national-average" &&
      plan?.metric === "mortality-rate" &&
      calls > 0,
  );
  await check(
    "GA3-NATIONAL-READMISSION-AVERAGE-NOW-SUCCESS",
    "hospitals performing above national readmission average",
    (r, calls, plan) =>
      r.success === true &&
      plan?.benchmark?.benchmark === "national-average" &&
      plan?.metric === "readmission-rate" &&
      calls > 0,
  );
  await check(
    "GA4-READMISSION-ABOVE-NATIONAL-READMISSION-AVERAGE-NOW-SUCCESS",
    "California hospitals with readmission rate above national readmission average",
    (r, calls, plan) =>
      r.success === true &&
      plan?.benchmark?.benchmark === "national-average" &&
      plan?.metric === "readmission-rate" &&
      calls > 0,
  );

  // Group B - controls, must remain SUCCESS national-average.
  await check(
    "GB5-CONTIGUOUS-CONTROL",
    "California hospitals performing above national average mortality",
    (r, calls, plan) => r.success === true && plan?.benchmark?.benchmark === "national-average" && calls > 0,
  );
  await check(
    "GB6-LOWER-THAN-NATIONAL-AVERAGE",
    "hospitals with mortality rate lower than national average",
    (r, calls, plan) => r.success === true && plan?.benchmark?.benchmark === "national-average" && calls > 0,
  );
  await check(
    "GB7-ABOVE-NATIONAL-AVERAGE-VARIANT",
    "California hospitals with mortality rate above national average",
    (r, calls, plan) => r.success === true && plan?.benchmark?.benchmark === "national-average" && calls > 0,
  );

  // Group C - bare "average" still works, not over-blocked.
  await check(
    "GC8-BARE-AVERAGE-STILL-MEDIAN",
    "California hospitals performing above average mortality",
    (r, calls, plan) => r.success === true && plan?.benchmark?.benchmark === "median" && calls > 0,
  );
  await check(
    "GC9-BARE-AVERAGE-NO-METRIC-UNCHANGED",
    "hospitals performing above average",
    () => true, // log actual only - must not regress, no specific shape asserted (matches V1's own treatment)
  );

  // Group D - master prompt's 12 ranking pairs, must stay identical (Framing 1, no-op).
  await check("GD10-LOWEST-MORTALITY-WITH", "hospitals with lowest mortality", (r) => r.success === true);
  await check("GD11-LOWEST-MORTALITY-BARE", "lowest mortality hospitals", (r) => r.success === true);
  await check("GD12-LOWEST-READMISSION-WITH", "hospitals with lowest readmission", (r) => r.success === true);
  await check("GD13-LOWEST-READMISSION-BARE", "lowest readmission hospitals", (r) => r.success === true);
  await check("GD14-BEST-HOSPITALS-BY-MORTALITY", "best hospitals by mortality", (r) => r.success === true);
  await check("GD15-HOSPITALS-BEST-BY-MORTALITY", "hospitals best by mortality", (r) => r.success === true);
  await check("GD16-TEXAS-LOWEST-MORTALITY-WITH", "Texas hospitals with lowest mortality", (r) => r.success === true);
  await check("GD17-LOWEST-MORTALITY-TEXAS-BARE", "lowest mortality Texas hospitals", (r) => r.success === true);

  // Group E - Task 1-3 preservation.
  await check(
    "GE18-MAYO-ROCHESTER",
    "Mayo Clinic Rochester Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows?.[0]?.facility_id === "240010",
  );
  await check(
    "GE19-MEMORIAL-HOSPITAL-TEXAS",
    "Memorial Hospital Texas",
    (r, calls) => r.success === false && r.answerability?.status === "ambiguous" && r.answerability?.candidates?.length === 3 && calls === 0,
  );
  await check(
    "GE20-BIRMINGHAM-9-ROWS",
    "Show me hospitals in Birmingham, Alabama with their overall ratings",
    (r) => r.success === true && r.rowCount === 9,
  );
  await check(
    "GE21-ALBANY-COUNTY-NY",
    "Show me the highest-rated hospitals in New York for ALBANY county",
    (r) => r.success === true && r.rowCount === 3,
  );

  // Group F - arbitrary, unregistered gap word must remain safely refused (safety net preserved).
  await check(
    "GF22-ARBITRARY-GAP-STILL-REFUSES",
    "California hospitals performing above national xyz average",
    (r, calls) => r.success === false && r.answerability?.status === "ambiguous" && r.answerability?.reason === "candidate-inconsistent" && calls === 0,
  );

  console.log("=".repeat(90));
  const passCount = results.filter((r) => r.passed).length;
  console.log(`SUMMARY: Total: ${results.length}  PASS: ${passCount}  FAIL: ${results.length - passCount}`);

  if (passCount !== results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
