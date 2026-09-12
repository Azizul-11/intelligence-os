/**
 * Pre-Phase 9 Tier1 Tasks 2 & 3 Combined Audit: 5-Star Value Filter
 * Routing + Layer 2 Continuation Prefix Parsing.
 *
 * STRICTLY DIAGNOSTIC - read-only, no production writes. Runs each query
 * live through the real, unmodified in-process RuntimeEngine (identical
 * pipeline the orchestrator uses) against the remote Supabase warehouse,
 * spy-instrumented for `sqlCalls`.
 *
 * Run: npx tsx scripts/verify-prephase9-tier1-t2-t3-audit.ts
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
  rows.push({ id, question, result, sqlCalls });

  const rowSample = (result.rows ?? [])[0];
  const distinctRatings = [...new Set((result.rows ?? []).map((r: any) => r.overall_rating))];
  const distinctFacilities = (result.rows ?? []).map((r: any) => r.facility_id).slice(0, 3);
  const lastGate = (result.trace ?? [])[(result.trace ?? []).length - 1];
  console.log(
    `[${id}] "${question}" -> success=${result.success} status=${result.answerability?.status} reason=${result.answerability?.reason ?? ""} rowCount=${result.rowCount ?? 0} sqlCalls=${sqlCalls} error=${JSON.stringify(result.error)} lastGate=${lastGate?.phase}/${lastGate?.status} distinctRatings=${JSON.stringify(distinctRatings)} facility_ids=${JSON.stringify(distinctFacilities)} sample=${JSON.stringify(rowSample)}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASKS 2 & 3 AUDIT (READ-ONLY)");
  console.log("=".repeat(100));

  console.log("\n--- Group A: Task 2 - 5-star value filter routing ---");
  await run("A1-5-STAR-HYPHEN", "Show me 5-star hospitals");
  await run("A2-5-SPACE-STAR", "Show me 5 star hospitals");
  await run("A3-5-STARS-PLURAL", "Show me hospitals with 5 stars");
  await run("A4-FIVE-STAR-WORD", "Show me five star hospitals");
  await run("A5-4-STAR", "Show me 4-star hospitals");
  await run("A6-5-STAR-TEXAS", "Show me 5-star hospitals in Texas");
  await run("A7-5-STAR-CALIFORNIA", "Show me 5-star hospitals in California");
  await run("A8-5-STAR-NONPROFIT", "Show me non-profit 5-star hospitals");
  await run("A9-5-STAR-AMI", "Show me 5-star hospitals with best AMI mortality");
  await run("A10-CTRL-BEST-OVERALL-RATING", "Show me hospitals with best overall rating");
  await run("A11-1-STAR", "Show me 1-star hospitals");

  console.log("\n--- Group B: Task 3 - conversational prefix parsing ---");
  await run("B1-TELL-ME-ABOUT-MAYO", "Tell me about Mayo Clinic");
  await run("B2-CTRL-BARE-MAYO", "Mayo Clinic");
  await run("B3-TELL-ME-ABOUT-MAYO-AMI", "Tell me about Mayo Clinic's mortality rate for heart attack");
  await run("B4-CTRL-WHAT-IS-MAYO-AMI", "What is Mayo Clinic's mortality rate for heart attack specifically?");
  await run("B5-TELL-ME-ABOUT-TEXAS", "Tell me about hospitals in Texas");
  await run("B6-CTRL-SHOW-ME-TEXAS", "Show me hospitals in Texas");
  await run("B7-WHAT-ABOUT-MAYO", "What about Mayo Clinic");
  await run("B8-SHOW-ME-ABOUT-MAYO", "Show me about Mayo Clinic");
  await run("B9-CAN-YOU-TELL-ME-ABOUT-MAYO", "Can you tell me about Mayo Clinic");
  await run("B10-COMBINED-PREFIX-5STAR-TEXAS", "Tell me about 5-star hospitals in Texas");

  console.log("\n--- Group C: Task 1-6 + Tier1 T1 preservation controls ---");
  await run("C1-BEST-OVERALL-RATING", "Show me hospitals with best overall rating");
  await run("C2-MAYO-ROCHESTER", "What is Mayo Clinic Rochester Minnesota's overall rating?");
  await run("C3-BIRMINGHAM", "Show me hospitals in Birmingham, Alabama with their overall ratings");
  await run("C4-ALBANY-NY", "Show me hospitals in ALBANY County, New York");
  await run("C5-NATIONAL-MORTALITY-AVG", "California hospitals performing above national mortality average");
  await run("C6-NONPROFIT-AMI", "Show me non-profit hospitals with best AMI mortality");
  await run("C7-READMISSIONS-PLURAL", "hospitals with lowest readmissions");
  await run("C8-HEART-ATTACKS-PLURAL", "Show me hospitals with best heart attacks mortality");

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY TABLE");
  console.log("=".repeat(100));
  for (const row of rows) {
    console.log(`${row.id}: success=${row.result.success} status=${row.result.answerability?.status ?? ""} rowCount=${row.result.rowCount ?? 0} sqlCalls=${row.sqlCalls}`);
  }

  console.log("\n--- Supplementary DB check: distinct overall_rating values ---");
  const { data: ratingValues } = await client.from("warehouse_hospitals").select("overall_rating").limit(3000);
  const distinct = [...new Set((ratingValues ?? []).map((r: any) => r.overall_rating))].sort();
  console.log(JSON.stringify(distinct));
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
