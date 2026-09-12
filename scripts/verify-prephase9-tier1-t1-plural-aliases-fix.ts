/**
 * Tier1 Task 1 Fix Verification: Plural / Morphological Variant Mapping.
 *
 * Live, in-process, spy-instrumented verification of Option A (literal
 * plural-form additions to existing Healthcare alias files) against the
 * remote Supabase warehouse. Supersedes
 * `verify-prephase9-tier1-t1-plural-alias-audit.ts` (left unmodified as a
 * frozen pre-fix reproduction) for regression purposes going forward.
 *
 * Run: npx tsx scripts/verify-prephase9-tier1-t1-plural-aliases-fix.ts
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

interface TestResult { id: string; passed: boolean; detail: string; }
const results: TestResult[] = [];
function record(id: string, passed: boolean, detail: string) {
  results.push({ id, passed, detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${id} - ${detail}`);
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

function measureCodes(rows: any[]): string[] {
  return [...new Set(rows.map((r) => r.measure_code).filter((v) => v !== undefined))];
}

async function check(id: string, question: string, assert: (r: any, rows: any[], calls: number) => boolean) {
  const { spyEngine, getCalls } = countingEngine();
  const r = await spyEngine.execute({ question });
  const rows = (r.rows ?? []) as any[];
  const calls = getCalls();
  const pass = assert(r, rows, calls);
  record(
    id,
    pass,
    `question="${question}" success=${r.success} status=${r.answerability?.status} rowCount=${rows.length} sqlCalls=${calls} measure_codes=${JSON.stringify(measureCodes(rows))} error=${JSON.stringify(r.error)}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASK 1 FIX VERIFICATION: PLURAL ALIASES");
  console.log("=".repeat(100));

  console.log("\n--- Metric plural fix proofs (previously FAIL, now must SUCCEED) ---");
  // Tier1 Task 5 UI/UX fix (2026-09-12, true raw / no LIMIT): these
  // ranking queries are no longer capped at 10 rows - rows.length > 0
  // is the meaningful assertion now (the plural/singular alias either
  // resolves and returns real rows, or it doesn't).
  await check("M1-READMISSIONS-PLURAL-FIXED", "hospitals with lowest readmissions", (r, rows, calls) => r.success === true && rows.length > 0 && calls > 0);
  await check("M1-CTRL-READMISSION-SINGULAR", "hospitals with lowest readmission", (r, rows, calls) => r.success === true && rows.length > 0 && calls > 0);

  await check("M2-MORTALITIES-PLURAL-FIXED", "lowest mortalities hospitals", (r, rows, calls) => r.success === true && rows.length > 0 && calls > 0);
  await check("M2-CTRL-MORTALITY-SINGULAR", "lowest mortality hospitals", (r, rows, calls) => r.success === true && rows.length > 0 && calls > 0);

  await check("M3-SAFETY-SCORES-PLURAL-FIXED", "hospitals with best safety scores", (r, rows, calls) => r.success === true && rows.length > 0 && calls > 0);
  await check("M3-CTRL-SAFETY-SCORE-SINGULAR", "hospitals with best safety score", (r, rows, calls) => r.success === true && rows.length > 0 && calls > 0);

  await check("M4-SAFETY-OUTCOME-SINGULAR-FIXED", "hospitals with better safety outcome", (r, rows, calls) => r.success === true && rows.length > 0 && calls > 0);
  await check("M4-CTRL-SAFETY-OUTCOMES-PLURAL", "hospitals with better safety outcomes", (r, rows, calls) => r.success === true && rows.length > 0 && calls > 0);

  console.log("\n--- Concept plural fix proofs (must NOT silently drop the condition filter) ---");
  await check(
    "C1-HEART-ATTACKS-PLURAL-NOW-SCOPED",
    "Show me hospitals with best heart attacks mortality",
    (r, rows, calls) => r.success === true && rows.length > 0 && measureCodes(rows).every((m) => m === "MORT_30_AMI") && calls > 0,
  );
  await check(
    "C1-CTRL-HEART-ATTACK-SINGULAR",
    "Show me hospitals with best heart attack mortality",
    (r, rows, calls) => r.success === true && rows.length > 0 && measureCodes(rows).every((m) => m === "MORT_30_AMI") && calls > 0,
  );

  await check(
    "C2-HEART-FAILURES-PLURAL-NOW-SCOPED",
    "Show me hospitals with best heart failures readmission",
    (r, rows, calls) => r.success === true && rows.length > 0 && measureCodes(rows).every((m) => m === "READM-30-HF-HRRP") && calls > 0,
  );
  await check(
    "C2-CTRL-HEART-FAILURE-SINGULAR",
    "Show me hospitals with best heart failure readmission",
    (r, rows, calls) => r.success === true && rows.length > 0 && measureCodes(rows).every((m) => m === "READM-30-HF-HRRP") && calls > 0,
  );

  await check(
    "C3-CABG-PLURAL-BYPASSES",
    "Show me hospitals with best heart bypasses mortality",
    (r, rows, calls) => r.success === true && rows.length > 0 && measureCodes(rows).every((m) => m === "MORT_30_CABG") && calls > 0,
  );
  await check(
    "C4-HIP-REPLACEMENTS-PLURAL",
    "Show me hospitals with best hip replacements readmission",
    (r, rows, calls) => r.success === true && rows.length > 0 && measureCodes(rows).every((m) => m === "READM-30-HIP-KNEE-HRRP") && calls > 0,
  );

  console.log("\n--- Group B: Task 1-6 preservation controls (must remain unaffected) ---");
  // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
  // same-day true-raw fix): back to the original top-10 ceiling.
  await check("B1-BEST-OVERALL-RATING", "Show me hospitals with best overall rating", (r, rows) => r.success === true && rows.length === 10);
  await check("B2-MAYO-ROCHESTER", "What is Mayo Clinic Rochester Minnesota's overall rating?", (r, rows) => r.success === true && rows[0]?.facility_id === "240010");
  await check("B3-BIRMINGHAM", "Show me hospitals in Birmingham, Alabama with their overall ratings", (r, rows) => r.success === true && rows.length === 9);
  await check("B4-ALBANY-NY", "Show me hospitals in ALBANY County, New York", (r, rows) => r.success === true && rows.length === 4);
  await check("B5-NATIONAL-MORTALITY-AVG", "California hospitals performing above national mortality average", (r) => r.success === true);
  await check("B6-NONPROFIT-AMI", "Show me non-profit hospitals with best AMI mortality", (r, rows) => r.success === true && measureCodes(rows).every((m) => m === "MORT_30_AMI"));

  console.log("\n--- Known separate gaps (must STILL fail after this fix - not a regression) ---");
  await check("G1-BARE-RATINGS-STILL-FAILS", "Show me hospitals with best ratings", (r) => r.success === false);
  await check("G1-BARE-RATING-STILL-FAILS", "Show me hospitals with best rating", (r) => r.success === false);
  await check("G2-BARE-SAFETIES-STILL-FAILS", "Show me hospitals with best safeties", (r) => r.success === false);
  await check("G2-BARE-SAFETY-STILL-FAILS", "Show me hospitals with best safety", (r) => r.success === false);
  await check("G3-BARE-EXPERIENCES-STILL-FAILS", "Show me hospitals with best experiences", (r) => r.success === false);
  await check("G3-BARE-EXPERIENCE-STILL-FAILS", "Show me hospitals with best experience", (r) => r.success === false);

  console.log("\n" + "=".repeat(100));
  const passed = results.filter((r) => r.passed).length;
  console.log(`SUMMARY: ${passed}/${results.length} PASS`);
  console.log("=".repeat(100));

  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
