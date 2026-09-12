/**
 * Tier1 Tasks 2 & 3 Fix Verification: 5-Star Value Filter + Prefix
 * Metric-Collision Fix.
 *
 * Live, in-process, spy-instrumented verification against the remote
 * Supabase warehouse. Supersedes the audit-only scripts
 * (verify-tier1-t2-5star-audit.ts / verify-tier1-t3-prefix-audit.ts /
 * verify-prephase9-tier1-t2-t3-audit.ts, all left frozen as pre-fix
 * reproductions) for regression purposes going forward.
 *
 * Run: npx tsx scripts/verify-tier1-t2-t3-5star-prefix-fix.ts
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

function distinctRatings(rows: any[]): string[] {
  return [...new Set(rows.map((r) => r.overall_rating))];
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
    `question="${question}" success=${r.success} status=${r.answerability?.status} rowCount=${rows.length} sqlCalls=${calls} distinctRatings=${JSON.stringify(distinctRatings(rows))} measure_codes=${JSON.stringify(measureCodes(rows))} error=${JSON.stringify(r.error)}`,
  );
}

async function main() {
  console.log("=".repeat(100));
  console.log("TIER1 TASKS 2 & 3 FIX VERIFICATION");
  console.log("=".repeat(100));

  console.log("\n--- Task 2: 5-star value filter (bare, previously clean FAIL) ---");
  await check("T2-1-5STAR-HYPHEN-FIXED", "Show me 5-star hospitals", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "5"));
  await check("T2-2-5-SPACE-STAR-FIXED", "Show me 5 star hospitals", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "5"));
  await check("T2-3-5-STARS-PLURAL-FIXED", "Show me hospitals with 5 stars", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "5"));
  await check("T2-4-FIVE-STAR-WORD-FIXED", "Show me five star hospitals", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "5"));
  await check("T2-5-4STAR-FIXED", "Show me 4-star hospitals", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "4"));
  await check("T2-6-1STAR-FIXED", "Show me 1-star hospitals", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "1"));

  console.log("\n--- Task 2: previously silent value-drop, now genuinely filtered ---");
  await check("T2-7-5STAR-TEXAS-NOW-FILTERED", "Show me 5-star hospitals in Texas", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "5"));
  await check("T2-8-5STAR-CALIFORNIA-NOW-FILTERED", "Show me 5-star hospitals in California", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "5"));
  await check("T2-9-5STAR-NONPROFIT-GENUINE", "Show me non-profit 5-star hospitals", (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "5") && rows.every((row) => String(row.ownership ?? "").startsWith("Voluntary non-profit")));
  await check("T2-10-5STAR-AMI-COMBINED", "Show me 5-star hospitals with best AMI mortality", (r, rows) => r.success === true && rows.length > 0 && measureCodes(rows).every((m) => m === "MORT_30_AMI"));
  // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
  // same-day true-raw fix): back to the original top-10 ceiling.
  await check("T2-CTRL-BEST-OVERALL-RATING", "Show me hospitals with best overall rating", (r, rows) => r.success === true && rows.length === 10);

  console.log("\n--- Task 3: prefix metric-collision fix ---");
  await check("T3-1-TELL-ME-ABOUT-MAYO-PRESERVED", "Tell me about Mayo Clinic", (r, rows) => r.success === true && rows.length === 1 && rows[0]?.facility_id === "100151");
  await check("T3-2-CTRL-BARE-MAYO-STILL-FAILS", "Mayo Clinic", (r) => r.success === false);
  await check(
    "T3-3-TELL-ME-ABOUT-MAYO-AMI-NOW-SCOPED",
    "Tell me about Mayo Clinic's mortality rate for heart attack",
    (r, rows) => r.success === true && rows.length === 1 && rows[0]?.facility_id === "100151" && rows[0]?.measure_code === "MORT_30_AMI",
  );
  await check(
    "T3-4-CTRL-WHAT-IS-MAYO-AMI",
    "What is Mayo Clinic's mortality rate for heart attack specifically?",
    (r, rows) => r.success === true && rows[0]?.measure_code === "MORT_30_AMI",
  );
  // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
  // same-day true-raw fix): back to the original 100 ceiling.
  await check("T3-5-TELL-ME-ABOUT-TEXAS-NOW-SUCCEEDS", "Tell me about hospitals in Texas", (r, rows) => r.success === true && rows.length === 100);
  await check("T3-6-CTRL-SHOW-ME-TEXAS", "Show me hospitals in Texas", (r, rows) => r.success === true && rows.length === 100);
  await check("T3-7-WHAT-ABOUT-MAYO-STILL-FAILS", "What about Mayo Clinic", (r) => r.success === false);
  await check("T3-8-SHOW-ME-ABOUT-MAYO-STILL-FAILS", "Show me about Mayo Clinic", (r) => r.success === false);
  await check("T3-9-CAN-YOU-TELL-ME-ABOUT-MAYO-PRESERVED", "Can you tell me about Mayo Clinic", (r, rows) => r.success === true && rows[0]?.facility_id === "100151");
  await check(
    "T3-10-COMBINED-PREFIX-5STAR-TEXAS-NOW-SUCCEEDS",
    "Tell me about 5-star hospitals in Texas",
    (r, rows) => r.success === true && rows.length > 0 && distinctRatings(rows).every((v) => v === "5"),
  );

  console.log("\n--- Group C: Task 1-6 + Tier1 T1 preservation controls ---");
  // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
  // same-day true-raw fix): C1/C7 are back to the original top-10
  // ceiling.
  await check("C1-BEST-OVERALL-RATING", "Show me hospitals with best overall rating", (r, rows) => r.success === true && rows.length === 10);
  await check("C2-MAYO-ROCHESTER", "What is Mayo Clinic Rochester Minnesota's overall rating?", (r, rows) => r.success === true && rows[0]?.facility_id === "240010");
  await check("C3-BIRMINGHAM", "Show me hospitals in Birmingham, Alabama with their overall ratings", (r, rows) => r.success === true && rows.length === 9);
  await check("C4-ALBANY-NY", "Show me hospitals in ALBANY County, New York", (r, rows) => r.success === true && rows.length === 4);
  await check("C5-NATIONAL-MORTALITY-AVG", "California hospitals performing above national mortality average", (r) => r.success === true);
  await check("C6-NONPROFIT-AMI", "Show me non-profit hospitals with best AMI mortality", (r, rows) => r.success === true && measureCodes(rows).every((m) => m === "MORT_30_AMI"));
  await check("C7-READMISSIONS-PLURAL", "hospitals with lowest readmissions", (r, rows) => r.success === true && rows.length === 10);
  await check("C8-HEART-ATTACKS-PLURAL", "Show me hospitals with best heart attacks mortality", (r, rows) => r.success === true && measureCodes(rows).every((m) => m === "MORT_30_AMI"));

  console.log("\n--- Known separate gaps: must STILL fail (not a regression) ---");
  await check("G1-BARE-RATINGS-STILL-FAILS", "Show me hospitals with best ratings", (r) => r.success === false);
  await check("G1-BARE-RATING-STILL-FAILS", "Show me hospitals with best rating", (r) => r.success === false);
  await check("G2-BARE-SAFETIES-STILL-FAILS", "Show me hospitals with best safeties", (r) => r.success === false);
  await check("G2-BARE-SAFETY-STILL-FAILS", "Show me hospitals with best safety", (r) => r.success === false);
  await check("G3-BARE-EXPERIENCES-STILL-FAILS", "Show me hospitals with best experiences", (r) => r.success === false);
  await check("G3-BARE-EXPERIENCE-STILL-FAILS", "Show me hospitals with best experience", (r) => r.success === false);

  console.log("\n--- Two-turn continuation controls (Task 6, unaffected) ---");
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "What is Memorial Hospital's mortality rate for heart attack specifically?" });
    record("T6-MEMORIAL-TURN1-UNAFFECTED", r.success === false && r.answerability?.status === "ambiguous" && r.answerability?.candidates?.length === 12, `success=${r.success} candidateCount=${r.answerability?.candidates?.length} sqlCalls=${getCalls()}`);
  }

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
