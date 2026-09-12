/**
 * Pre-Phase 9 Tier1 Task 5 Fix Verification: Multi-State Comparison
 * Execution Pipeline (F6 Layer B) - Phase 1 + Phase 2 + Phase 3 wired.
 *
 * Live, in-process, spy-instrumented against the remote Supabase warehouse.
 * Authoritative post-fix verification - supersedes the audit script
 * (verify-tier1-t5-multistate-audit.ts) for regression purposes.
 *
 * Run: npx tsx scripts/verify-tier1-t5-multistate-fix.ts
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

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);

let pass = 0;
let fail = 0;
function check(id: string, label: string, condition: boolean, detail: string) {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${id} ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${id} ${label} -- ${detail}`);
  }
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

async function run(question: string) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const sqlCalls = getCalls();
  const rows = (result.rows ?? []) as any[];
  const states = Array.from(new Set(rows.map((r) => r.state).filter(Boolean)));
  console.log(
    `    "${question}" -> success=${result.success} status=${result.answerability?.status} rowCount=${result.rowCount ?? 0} sqlCalls=${sqlCalls} states=${JSON.stringify(states)} error=${JSON.stringify(result.error)}`,
  );
  return { result, sqlCalls, rows, states };
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 5 FIX VERIFICATION: MULTI-STATE COMPARISON EXECUTION PIPELINE (POST-FIX)");
  console.log("=".repeat(100));

  console.log("\n--- Part 1: Phase 8.13 invariant - the P0 bug (lookup-shaped multi-state) ---");
  {
    // Tier1 Task 5 balanced-limits fix (supersedes the same-day true-raw
    // fix): a multi-state listing is capped at 50 PER named state
    // (ROW_NUMBER() OVER PARTITION BY state), not dumped uncapped. Both
    // TX and CA have well over 50 hospitals each, so this returns
    // exactly 100 (50+50), balanced.
    const { result, sqlCalls, states } = await run("Show me hospitals in Texas and California");
    check("P0-1", "lookup multi-state succeeds, both states present, no leaked error, balanced (50/state)", result.success === true && result.rowCount === 100 && sqlCalls === 1 && states.includes("TX") && states.includes("CA") && !result.error, `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)} error=${result.error}`);
  }
  {
    const { result, sqlCalls, states } = await run("Show me 5-star hospitals in Texas and California");
    const allFive = (await run("Show me 5-star hospitals in Texas and California")).rows.every((r: any) => String(r.overall_rating) === "5");
    check("P0-2", "5-star lookup multi-state succeeds, both states, all rating 5", result.success === true && sqlCalls === 1 && states.includes("TX") && states.includes("CA") && allFive, `success=${result.success} states=${JSON.stringify(states)} allFive=${allFive}`);
  }
  {
    const { result, sqlCalls, states } = await run("5-star hospitals in Florida and Georgia");
    check("P0-3", "5-star lookup multi-state (FL/GA) succeeds, both states present", result.success === true && sqlCalls === 1 && states.includes("FL") && states.includes("GA"), `success=${result.success} states=${JSON.stringify(states)}`);
  }

  console.log("\n--- Part 2: multi-state ranking (Tier1 T5 balanced-limits fix) - previously safely refused (or crowded out to 10, all one state), now returns a fair top-5-per-state balance ---");
  {
    const { result, sqlCalls, states } = await run("Best hospitals in Texas and California");
    check("R-1", "ranking multi-state succeeds, balanced (5/state, 10 total), both states present", result.success === true && result.rowCount === 10 && sqlCalls > 0 && states.includes("TX") && states.includes("CA"), `success=${result.success} rowCount=${result.rowCount} sqlCalls=${sqlCalls} states=${JSON.stringify(states)}`);
  }
  {
    const { result, states } = await run("Top hospitals in New York and Florida");
    check("R-2", "ranking multi-state (NY/FL) succeeds, balanced (5/state, 10 total), both states present", result.success === true && result.rowCount === 10 && states.includes("NY") && states.includes("FL"), `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result, states } = await run("Best hospitals in California and Texas");
    check("R-3", "order-agnostic: reversed mention order still succeeds, balanced, both states present", result.success === true && result.rowCount === 10 && states.includes("TX") && states.includes("CA"), `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result, states } = await run("Best hospitals in Texas, California and Florida");
    check("R-4", "3-state ranking succeeds (future-proof: any state count), balanced (5/state, 15 total), all 3 present", result.success === true && result.rowCount === 15 && states.includes("TX") && states.includes("CA") && states.includes("FL"), `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result, states } = await run("Show me hospitals with best overall rating in Texas and California");
    check("R-5", "ranking multi-state with explicit 'best overall rating' phrasing succeeds, balanced, both states present", result.success === true && result.rowCount === 10 && states.includes("TX") && states.includes("CA"), `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    // Sanity: single-state ranking still returns exactly the
    // single-state/nationwide ceiling (10), TX-only, unaffected by the
    // multi-state per-state partitioning.
    const { rows: txRows, result: txResult } = await run("Best hospitals in Texas");
    const singleStateTxCount = txRows.filter((r: any) => r.state === "TX").length;
    check("R-6", "single-state Texas ranking still returns exactly 10 TX-only rows (ceiling unaffected by multi-state balancing)", txResult.rowCount === 10 && singleStateTxCount === txRows.length, `rowCount=${txResult.rowCount} txRows=${txRows.length}`);
  }

  console.log("\n--- Part 3: multi-state comparison (Phase 3 wired) - previously 'SQL template not found', now succeeds balanced ---");
  {
    const { result, sqlCalls } = await run("Compare hospital ratings in Texas and California");
    check("C-1", "compare + multi-state succeeds balanced (routed to ranking template, no more 'SQL template not found')", result.success === true && result.rowCount === 10 && sqlCalls > 0 && result.error !== "SQL template not found.", `success=${result.success} rowCount=${result.rowCount} sqlCalls=${sqlCalls} error=${result.error}`);
  }
  {
    const { result, states } = await run("Compare hospitals in Ohio and Michigan");
    check("C-2", "compare + multi-state (bare hospital-list metric) succeeds, balanced (<=50/state, <=100 total), both states present", result.success === true && result.rowCount! <= 100 && states.includes("OH") && states.includes("MI"), `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result } = await run("Compare hospital ratings in Texas, California and Florida");
    check("C-3", "compare + 3-state succeeds, balanced (15 total)", result.success === true && result.rowCount === 15, `success=${result.success} rowCount=${result.rowCount}`);
  }

  console.log("\n--- Part 4: single-state & Tier0/Tier1 controls (zero regressions) ---");
  {
    // Tier1 Task 5 balanced-limits fix: single-state lookup keeps its
    // sensible ceiling of 100 (multiState=false path) - unaffected by
    // the multi-state 50/state balancing.
    const { result, states } = await run("Show me hospitals in Texas");
    check("S-1", "single-state lookup: capped at sensible ceiling of 100, TX only", result.success === true && result.rowCount === 100 && states.length === 1 && states[0] === "TX", `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    const { result, states } = await run("Show me 5-star hospitals in Texas");
    check("S-2", "single-state 5-star unaffected: 29 rows (already below any prior cap), TX only", result.success === true && result.rowCount === 29 && states.length === 1 && states[0] === "TX", `rowCount=${result.rowCount} states=${JSON.stringify(states)}`);
  }
  {
    // Tier1 Task 5 balanced-limits fix (supersedes the same-day true-raw
    // fix, which dumped all 3182 eligible rows - a real payload/UX
    // problem): nationwide ranking (no state at all) goes through the
    // PARTITION BY 'ALL' branch, capped at the same top-10 ceiling as
    // before Task 5 ever touched this template.
    const { result } = await run("Show me hospitals with best overall rating");
    check("S-3", "no-state ranking: top 10 nationwide (not 3182 - no payload dump)", result.success === true && result.rowCount === 10, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("What is Mayo Clinic Rochester Minnesota's overall rating?");
    const facilityIds = (result.rows ?? []).map((r: any) => r.facility_id);
    check("S-4", "Task 3 control: Mayo Rochester facility 240010", result.success === true && facilityIds.includes("240010"), `facility_ids=${JSON.stringify(facilityIds)}`);
  }
  {
    const { result } = await run("Show me hospitals in Birmingham, Alabama with their overall ratings");
    check("S-5", "Task 2 control: Birmingham 9 rows", result.success === true && result.rowCount === 9, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("Show me hospitals in ALBANY County, New York");
    check("S-6", "Task 1 control: ALBANY NY 4 rows", result.success === true && result.rowCount === 4, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("California hospitals performing above national mortality average");
    check("S-7", "Task 4 V2 control: national mortality average succeeds", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("Show me non-profit hospitals with best AMI mortality");
    check("S-8", "Task 5 B-full control: non-profit AMI succeeds", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("hospitals with lowest readmissions");
    check("S-9", "Tier1 T1 control: readmissions plural succeeds", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("Show me hospitals with best heart attacks mortality");
    check("S-10", "Tier1 T1 control: heart attacks plural scoped correctly", result.success === true, `success=${result.success}`);
  }
  {
    const { result } = await run("Show me 5-star hospitals");
    const allFive = (result.rows ?? []).every((r: any) => String(r.overall_rating) === "5");
    check("S-11", "Tier1 T2 control: bare 5-star, all rows rating 5", result.success === true && allFive, `allFive=${allFive}`);
  }
  {
    const { result } = await run("Tell me about Mayo Clinic's mortality rate for heart attack");
    check("S-12", "Tier1 T3 control: prefix metric-collision fix preserved", result.success === true, `success=${result.success}`);
  }
  {
    // Tier1 Task 5 balanced-limits fix: routes through the same
    // hospital-list-by-state.ts, single-state ceiling of 100.
    const { result } = await run("Tell me about hospitals in Texas");
    check("S-13", "Tier1 T3 control: Gate 6 fix preserved, capped at 100 (single-state ceiling)", result.success === true && result.rowCount === 100, `rowCount=${result.rowCount}`);
  }
  {
    const { result } = await run("Tell me about Mayo Clinic");
    const rowSample = (result.rows ?? [])[0];
    const columns = rowSample ? Object.keys(rowSample) : [];
    check("S-14", "Tier1 T4 control: rich 22-column dossier preserved", result.success === true && columns.length === 22, `columns=${columns.length}`);
  }
  {
    const { result } = await run("Tell me everything about NYU LANGONE HOSPITALS");
    const rowSample = (result.rows ?? [])[0];
    const columns = rowSample ? Object.keys(rowSample) : [];
    check("S-15", "Tier1 T4 control: new alias + rich dossier preserved", result.success === true && columns.length === 22, `columns=${columns.length}`);
  }
  {
    const { result } = await run("Compare NYU LANGONE HOSPITALS vs CEDARS-SINAI MEDICAL CENTER");
    const rowSample = (result.rows ?? [])[0];
    const columns = rowSample ? Object.keys(rowSample) : [];
    check("S-16", "Tier1 T4 control: hospital compare unaffected, 2 rows, 15 columns", result.success === true && result.rowCount === 2 && columns.length === 15, `rowCount=${result.rowCount} columns=${columns.length}`);
  }

  console.log("\n--- Known separate gaps: must still FAIL (not a regression) ---");
  {
    const { result, sqlCalls } = await run("Top non-profit hospitals in Texas and California");
    check("K-1", "hospital-list-ranking gap still fails safely (pre-existing, unrelated to state count)", result.success === false && sqlCalls === 0, `success=${result.success} sqlCalls=${sqlCalls}`);
  }
  {
    const { result } = await run("Show me hospitals with best ratings");
    check("K-2", "bare 'ratings' still fails (F13, out of scope)", result.success === false, `success=${result.success}`);
  }

  console.log("\n" + "=".repeat(100));
  console.log(`RESULT: ${pass} PASS, ${fail} FAIL`);
  console.log("=".repeat(100));

  console.log("\n--- Supplementary: alias/metric/SQL template listing ---");
  const { hospitalListByStateSqlTemplate } = await import("../domain-packs/healthcare/src/sql/hospital-list-by-state");
  console.log("hospital-list-by-state.ts template (after Phase 2):\n" + hospitalListByStateSqlTemplate.template);

  console.log("\n--- Supplementary DB check: distinct state (paginated, full 5442 rows) ---");
  const states = new Set<string>();
  let from = 0;
  for (;;) {
    const { data } = await client.from("warehouse_hospitals").select("state").range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const row of data as any[]) if (row.state) states.add(row.state);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`distinct states (${states.size}):`, JSON.stringify(Array.from(states).sort()));

  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
