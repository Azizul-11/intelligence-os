/**
 * Pre-Phase 9 Tier1 Task 1 Audit: Plural / Morphological Variant Mapping.
 *
 * STRICTLY DIAGNOSTIC - read-only, no production writes. Runs each query
 * live through the real, unmodified in-process RuntimeEngine (identical
 * pipeline the orchestrator uses) against the remote Supabase warehouse,
 * spy-instrumented for `sqlCalls`, logging exactly which gate/answerability
 * a plural phrasing hits versus its singular control.
 *
 * Run: npx tsx scripts/verify-prephase9-tier1-t1-plural-alias-audit.ts
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
  const lastGate = (result.trace ?? [])[(result.trace ?? []).length - 1];
  console.log(
    `[${id}] "${question}" -> success=${result.success} status=${result.answerability?.status} reason=${result.answerability?.reason ?? ""} rowCount=${result.rowCount ?? 0} sqlCalls=${sqlCalls} error=${JSON.stringify(result.error)} lastGate=${lastGate?.phase}/${lastGate?.status} sample=${JSON.stringify(rowSample)}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 1 AUDIT: PLURAL / MORPHOLOGICAL VARIANT MAPPING (READ-ONLY)");
  console.log("=".repeat(100));

  console.log("\n--- Group A: plural vs singular pairs ---");
  await run("A1-BEST-RATINGS-TX", "best hospitals in Texas by ratings");
  await run("A1-CTRL-BEST-RATING-TX", "best hospitals in Texas by rating");
  await run("A1b-HIGHEST-RATINGS", "highest ratings hospitals");
  await run("A1b-CTRL-HIGHEST-RATING", "highest rating hospitals");

  await run("A2-SAFETY-SCORES", "hospitals with best safety scores");
  await run("A2-CTRL-SAFETY-SCORE", "hospitals with best safety score");

  await run("A3-READMISSIONS", "hospitals with lowest readmissions");
  await run("A3-CTRL-READMISSION", "hospitals with lowest readmission");

  await run("A4-MORTALITIES", "lowest mortalities hospitals");
  await run("A4-CTRL-MORTALITY", "lowest mortality hospitals");

  await run("A5-SAFETY-OUTCOMES", "hospitals with better safety outcomes");
  await run("A5-CTRL-SAFETY-OUTCOME", "hospitals with better safety outcome");

  await run("A6-BARE-TX-RATINGS", "Texas hospital ratings");
  await run("A6-BARE-CA-SCORES", "California hospital scores");

  console.log("\n--- Group A (master prompt's own numbered list) ---");
  await run("A-Q1-BEST-RATINGS", "Show me hospitals with best ratings");
  await run("A-Q2-BEST-RATING", "Show me hospitals with best rating");
  await run("A-Q3-MAYO-RATINGS", "What is Mayo Clinic's ratings?");
  await run("A-Q4-MAYO-RATING", "What is Mayo Clinic's rating?");
  await run("A-Q5-LOWEST-MORTALITIES", "Show me hospitals with lowest mortalities");
  await run("A-Q6-LOWEST-MORTALITY", "Show me hospitals with lowest mortality");
  await run("A-Q7-LOWEST-READMISSIONS", "Show me hospitals with lowest readmissions");
  await run("A-Q8-LOWEST-READMISSION", "Show me hospitals with lowest readmission");
  await run("A-Q9-BEST-SAFETIES", "Show me hospitals with best safeties");
  await run("A-Q10-BEST-SAFETY", "Show me hospitals with best safety");
  await run("A-Q11-BEST-EXPERIENCES", "Show me hospitals with best experiences");
  await run("A-Q12-BEST-EXPERIENCE", "Show me hospitals with best experience");
  await run("A-Q13-HEART-ATTACKS-MORT", "Show me hospitals with best heart attacks mortality");
  await run("A-Q14-HEART-ATTACK-MORT", "Show me hospitals with best heart attack mortality");
  await run("A-Q15-HEART-FAILURES-READMIT", "Show me hospitals with best heart failures readmission");
  await run("A-Q16-HEART-FAILURE-READMIT", "Show me hospitals with best heart failure readmission");

  console.log("\n--- Group B: Task 1-6 preservation controls ---");
  await run("B-Q17-BEST-OVERALL-RATING", "Show me hospitals with best overall rating");
  await run("B-Q18-MAYO-ROCHESTER", "What is Mayo Clinic Rochester Minnesota's overall rating?");
  await run("B-Q19-BIRMINGHAM", "Show me hospitals in Birmingham, Alabama with their overall ratings");
  await run("B-Q20-ALBANY-NY", "Show me hospitals in ALBANY County, New York");
  await run("B-Q21-NATIONAL-MORTALITY-AVG", "California hospitals performing above national mortality average");
  await run("B-Q22-NONPROFIT-AMI", "Show me non-profit hospitals with best AMI mortality");

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY TABLE");
  console.log("=".repeat(100));
  for (const row of rows) {
    console.log(`${row.id}: success=${row.result.success} status=${row.result.answerability?.status ?? ""} sqlCalls=${row.sqlCalls}`);
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
