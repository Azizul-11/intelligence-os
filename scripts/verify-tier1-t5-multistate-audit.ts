/**
 * Pre-Phase 9 Tier1 Task 5 Audit: Multi-State Comparison Execution
 * Pipeline (F6 Layer B).
 *
 * STRICTLY DIAGNOSTIC - read-only, no production writes. Live, in-process,
 * spy-instrumented against the remote Supabase warehouse.
 *
 * Run: npx tsx scripts/verify-tier1-t5-multistate-audit.ts
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

interface Row { id: string; question: string; result: any; sqlCalls: number; }
const rows: Row[] = [];

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

async function run(id: string, question: string) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const sqlCalls = getCalls();

  const rowSample = (result.rows ?? [])[0];
  const columns = rowSample ? Object.keys(rowSample) : [];
  const distinctStates = Array.from(new Set((result.rows ?? []).map((r: any) => r.state))).filter(Boolean);
  const trace = result.trace ?? [];
  const planBuildingEntry = trace.find((t: any) => t.phase === "execution-plan-building");

  console.log(
    `[${id}] "${question}" -> success=${result.success} status=${result.answerability?.status} reason=${result.answerability?.reason ?? ""} rowCount=${result.rowCount ?? 0} sqlCalls=${sqlCalls} error=${JSON.stringify(result.error)} columns(${columns.length})=${JSON.stringify(columns)} distinctStates=${JSON.stringify(distinctStates)}`,
  );
  if (rowSample) console.log("  sample:", JSON.stringify(rowSample));
  if (result.rows && result.rows.length > 1) console.log("  last row:", JSON.stringify(result.rows[result.rows.length - 1]));
  rows.push({ id, question, result, sqlCalls });
  return result;
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 5 AUDIT: MULTI-STATE COMPARISON EXECUTION PIPELINE F6 LAYER B (READ-ONLY)");
  console.log("=".repeat(100));

  console.log("\n--- Group A: multi-state ranking ---");
  await run("A1-BEST-TX-CA", "Best hospitals in Texas and California");
  await run("A2-TOP-NY-FL", "Top hospitals in New York and Florida");
  await run("A9-BEST-CA-TX-REVERSED", "Best hospitals in California and Texas");
  await run("A7-THREE-STATES", "Best hospitals in Texas, California and Florida");

  console.log("\n--- Group A: multi-state comparison intent ---");
  await run("A3-COMPARE-RATINGS-TX-CA", "Compare hospital ratings in Texas and California");
  await run("A4b-COMPARE-OH-MI", "Compare hospitals in Ohio and Michigan");
  await run("A4-COMPARE-BEST-TX-CA", "Compare best hospitals in Texas and California");
  await run("A8-COMPARE-THREE-STATES", "Compare hospital ratings in Texas, California and Florida");

  console.log("\n--- Group A: combined filters across multi-state ---");
  await run("A5-HOSPITALS-TX-CA", "Show me hospitals in Texas and California");
  await run("A6-5STAR-TX-CA", "Show me 5-star hospitals in Texas and California");
  await run("A2b-NONPROFIT-TX-CA", "Top non-profit hospitals in Texas and California");
  await run("A2c-5STAR-FL-GA", "5-star hospitals in Florida and Georgia");
  await run("A10-BEST-OVERALL-RATING-TX-CA", "Show me hospitals with best overall rating in Texas and California");

  console.log("\n--- Group B: Task 1-6 + Tier1 T1-T4 preservation controls ---");
  await run("B1-BEST-OVERALL-RATING", "Show me hospitals with best overall rating");
  await run("B2-MAYO-ROCHESTER", "What is Mayo Clinic Rochester Minnesota's overall rating?");
  await run("B3-BIRMINGHAM", "Show me hospitals in Birmingham, Alabama with their overall ratings");
  await run("B4-ALBANY-NY", "Show me hospitals in ALBANY County, New York");
  await run("B5-NATIONAL-MORTALITY-AVG", "California hospitals performing above national mortality average");
  await run("B6-NONPROFIT-AMI", "Show me non-profit hospitals with best AMI mortality");
  await run("B7-READMISSIONS-PLURAL", "hospitals with lowest readmissions");
  await run("B8-HEART-ATTACKS-PLURAL", "Show me hospitals with best heart attacks mortality");
  await run("B9-5STAR", "Show me 5-star hospitals");
  await run("B10-5STAR-TEXAS", "Show me 5-star hospitals in Texas");
  await run("B11-TELL-ME-ABOUT-MAYO-AMI", "Tell me about Mayo Clinic's mortality rate for heart attack");
  await run("B12-TELL-ME-ABOUT-TEXAS", "Tell me about hospitals in Texas");
  await run("B13-TELL-ME-ABOUT-5STAR-TEXAS", "Tell me about 5-star hospitals in Texas");
  await run("B14-TELL-ME-ABOUT-MAYO", "Tell me about Mayo Clinic");
  await run("B15-TELL-ME-EVERYTHING-NYU", "Tell me everything about NYU LANGONE HOSPITALS");
  await run("B16-COMPARE-2-HOSPITALS", "Compare NYU LANGONE HOSPITALS vs CEDARS-SINAI MEDICAL CENTER");

  console.log("\n--- Known separate gaps: expected to still FAIL (not part of this audit) ---");
  await run("K1-BARE-RATINGS", "Show me hospitals with best ratings");
  await run("K2-BARE-SAFETIES", "Show me hospitals with best safeties");

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY TABLE");
  console.log("=".repeat(100));
  for (const row of rows) {
    console.log(`${row.id}: success=${row.result.success} status=${row.result.answerability?.status ?? ""} rowCount=${row.result.rowCount ?? 0} sqlCalls=${row.sqlCalls} error=${JSON.stringify(row.result.error)}`);
  }

  console.log("\n--- Supplementary DB check: warehouse_hospitals distinct state values ---");
  const { data: states } = await client.from("warehouse_hospitals").select("state").range(0, 9999);
  const distinctStates = Array.from(new Set((states ?? []).map((r: any) => r.state))).sort();
  console.log(`distinct states (${distinctStates.length}):`, JSON.stringify(distinctStates));

  console.log("\n--- Supplementary DB check: TX/CA sample ---");
  const { data: sample } = await client.from("warehouse_hospitals").select("*").in("state", ["TX", "CA"]).limit(2);
  console.log(JSON.stringify(sample, null, 2));

  console.log("\n--- Supplementary DB check: warehouse_hospitals schema ---");
  const { data: schemaRow } = await client.from("warehouse_hospitals").select("*").eq("facility_id", "100151").limit(1);
  console.log("COLUMNS:", schemaRow && schemaRow[0] ? JSON.stringify(Object.keys(schemaRow[0])) : "none");

  console.log("\n--- Supplementary DB check: distinct overall_rating ---");
  const { data: ratings } = await client.from("warehouse_hospitals").select("overall_rating").range(0, 9999);
  const distinctRatings = Array.from(new Set((ratings ?? []).map((r: any) => r.overall_rating))).sort();
  console.log("distinct overall_rating:", JSON.stringify(distinctRatings));
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
