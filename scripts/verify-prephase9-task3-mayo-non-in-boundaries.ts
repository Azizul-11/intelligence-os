/**
 * Tier0 Task 3: Mayo Rochester Non-"in" Qualifier — Fix B + Safety Half A
 * Verification Suite.
 *
 * T1-T3 updated by Tier0 Task 3 FULL FIX (brand aliasing): these three
 * originally asserted a bare, SAFE FAILURE for the Mayo Rochester
 * no-"in" phrasing - correct for the narrower Fix B + Safety Half A
 * scope this file was first written for, and explicitly NOT the same
 * as returning correct Rochester data (out of scope at the time). The
 * Full Fix closes that remaining gap, so these now assert the actual
 * correct outcome (facility 240010) - a strictly stronger guarantee
 * that still proves the original P0 (100151 never silently reused).
 * See scripts/verify-prephase9-task3-full-fix-brand-alias.ts for the
 * broader, multi-brand verification the Full Fix also requires.
 *
 * Verifies, against the live remote database, that:
 * - The exact-official-name cases still work (unaffected).
 * - Memorial Hospital Texas now narrows to 3 TX candidates instead of 12
 *   nationwide, both with and without "in".
 * - Johns Hopkins (Root Cause C) and Birmingham (Task 2) are unchanged.
 *
 * Run: npx tsx scripts/verify-prephase9-task3-mayo-non-in-boundaries.ts
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

async function check(id: string, question: string, assert: (r: any, calls: number) => boolean) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const rows = (result.rows ?? []) as any[];
  const pass = assert(result, getCalls());
  record(
    id,
    pass,
    `success=${result.success} answerability=${JSON.stringify(result.answerability?.status)} rowCount=${result.rowCount} sqlCalls=${getCalls()} facility_ids=[${rows.map((r) => r.facility_id).join(",")}] error="${result.error}"`,
  );
}

async function main() {
  console.log("=".repeat(80));
  console.log("TIER0 TASK 3: MAYO NON-IN BOUNDARIES VERIFICATION");
  console.log("=".repeat(80));

  // 1. Full Fix: no-"in" Mayo Rochester now resolves correctly to 240010
  // (never 100151 - the original P0, still proven, now via a stronger check).
  await check(
    "T1-MAYO-ROCHESTER-NO-IN-BRAND-ALIAS-RESOLVED",
    "Mayo Clinic Rochester Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "240010",
  );

  // 2. With-"in" resolves the same way (unchanged relative to T1, control).
  await check(
    "T2-MAYO-ROCHESTER-WITH-IN-BRAND-ALIAS-RESOLVED",
    "Mayo Clinic in Rochester Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "240010",
  );

  // 3. Comma variant, same expectation.
  await check(
    "T3-MAYO-ROCHESTER-COMMA-BRAND-ALIAS-RESOLVED",
    "Mayo Clinic in Rochester, Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "240010",
  );

  // 4. Exact official name still works (must preserve).
  await check(
    "T4-MAYO-HOSPITAL-ROCHESTER-EXACT-PRESERVED",
    "Mayo Clinic Hospital Rochester overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "240010",
  );

  // 5. Exact official name + state, still works.
  await check(
    "T5-MAYO-HOSPITAL-ROCHESTER-MN-EXACT-PRESERVED",
    "Mayo Clinic Hospital Rochester Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "240010",
  );

  // 6. Unique name, no "in" - unaffected.
  await check(
    "T6-CLEVELAND-CLINIC-NO-IN-PRESERVED",
    "Cleveland Clinic Ohio overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "360180",
  );

  // 7. Unique name, with "in" - control.
  await check(
    "T7-CLEVELAND-CLINIC-WITH-IN-PRESERVED",
    "Cleveland Clinic in Ohio overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "360180",
  );

  // 8. Root Cause B fixed: no "in" - must narrow to 3 TX, not 12 nationwide.
  await check(
    "T8-MEMORIAL-TEXAS-NO-IN-NARROWED",
    "Memorial Hospital Texas overall rating",
    (r) =>
      r.success === false &&
      r.answerability?.status === "ambiguous" &&
      (r.answerability?.candidates?.length ?? 0) === 3,
  );

  // 9. Root Cause B fixed: with "in" - must also narrow to 3 TX, not 12.
  await check(
    "T9-MEMORIAL-TEXAS-WITH-IN-NARROWED",
    "Memorial Hospital in Texas overall rating",
    (r) =>
      r.success === false &&
      r.answerability?.status === "ambiguous" &&
      (r.answerability?.candidates?.length ?? 0) === 3,
  );

  // 10. Root Cause C explicitly deferred - unchanged, still safe.
  await check(
    "T10-JOHNS-HOPKINS-DEFERRED-UNCHANGED",
    "Johns Hopkins overall rating",
    (r) => r.success === false && r.answerability?.status === "ambiguous",
  );

  // 11. Task 2 Birmingham fix preserved.
  await check(
    "T11-BIRMINGHAM-TASK2-PRESERVED",
    "Show me hospitals in Birmingham, Alabama with their overall ratings",
    (r) => r.success === true && r.rowCount === 9,
  );

  console.log("\n" + "=".repeat(80));
  const passed = results.filter((r) => r.passed).length;
  console.log(`SUMMARY: Total: ${results.length}  PASS: ${passed}  FAIL: ${results.length - passed}`);
  if (passed < results.length) {
    results.filter((r) => !r.passed).forEach((r) => console.log(`  FAIL ${r.id}: ${r.detail}`));
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
