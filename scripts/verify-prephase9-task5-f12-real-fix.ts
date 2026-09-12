/**
 * Tier0 Task 5: F12 Ownership & Condition-Specific Measures — REAL FIX
 * Verification Suite.
 *
 * Part A (ownership): a Domain-owned ownership entity/directory
 * (domain-packs/healthcare/src/entities/ownership.ts,
 * domain-packs/healthcare/src/runtime/ownership-directory.ts), wired
 * into entity-provider.ts's bare-phrase resolution (mirroring
 * state/county/city) and into every ranking + list SQL template's
 * WHERE clause as an `:ownership` LIKE-pattern parameter. Zero
 * Universal Core change - ExecutionPlanMapper.buildFilters() and
 * HealthcareExecutionStrategy.resolveParametersFromPlan() already wire
 * any entity with `execution.parameter` set generically.
 *
 * Part B (condition) - GB7-GB12 updated by the B-full upgrade (see
 * verify-prephase9-task5-f12-real-fix-b-full.ts): the 5 new
 * `"concept"`-type aliases (CABG, COPD, Hip/Knee, Heart Failure,
 * Pneumonia) originally only reached the Phase 8.8 safety-refusal gate
 * (B-minimal). They now resolve to real, condition-specific ranking
 * data via a Domain-declared `measureCodesByMetric` map on each
 * concept, consumed generically by
 * `ExecutionPlanMapper.buildFilters()` into a `measureCode` filter, and
 * 2 new SQL templates joining the per-condition detail tables. Same
 * "deliberate, documented reversal" pattern used for Task 3's test
 * 6/11 and Task 4's V1→V2 - the original safety property (never
 * silently execute an unscoped ranking) is preserved by a *stronger*
 * guarantee: the condition is now genuinely answered, not merely
 * safely refused.
 *
 * Run: npx tsx scripts/verify-prephase9-task5-f12-real-fix.ts
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
    `success=${result.success} answerability=${JSON.stringify(result.answerability?.status)}/${JSON.stringify(result.answerability?.reason)} rowCount=${result.rowCount} sqlCalls=${getCalls()} error=${JSON.stringify(result.error)} ownership=${JSON.stringify([...new Set(rows.map((r) => r.ownership))])} facility_ids=[${rows.map((r) => r.facility_id).join(",")}]`,
  );
}

async function main() {
  console.log("=".repeat(90));
  console.log("TIER0 TASK 5: F12 REAL FIX (OWNERSHIP + CONDITION SAFETY-NET) VERIFICATION");
  console.log("=".repeat(90));

  // Group A - ownership filtering, must now be answerable with a strictly-matching ownership filter.
  await check(
    "GA1-NONPROFIT-LOWEST-MORTALITY",
    "Show me non-profit hospitals with lowest mortality",
    (r, calls) =>
      r.success === true && calls > 0 &&
      (r.rows ?? []).every((row: any) => typeof row.ownership === "string" && row.ownership.startsWith("Voluntary non-profit")),
  );
  await check(
    "GA2-NONPROFIT-TEXAS-BEST-RATING",
    "Show me non-profit hospitals in Texas with best overall rating",
    (r, calls) =>
      r.success === true && calls > 0 &&
      (r.rows ?? []).every((row: any) => row.state === "TX" && String(row.ownership ?? "").startsWith("Voluntary non-profit")),
  );
  await check(
    "GA3-PROPRIETARY-LOWEST-READMISSION",
    "Show me proprietary hospitals with lowest readmission",
    (r, calls) =>
      r.success === true && calls > 0 &&
      (r.rows ?? []).every((row: any) => row.ownership === "Proprietary"),
  );
  await check(
    "GA4-GOVERNMENT-HIGHEST-RATING",
    "Show me government hospitals with highest overall rating",
    (r, calls) =>
      r.success === true && calls > 0 &&
      (r.rows ?? []).every((row: any) => String(row.ownership ?? "").startsWith("Government")),
  );
  await check(
    "GA5-NONPROFIT-BARE-NO-METRIC-NOW-ANSWERABLE",
    "Show me non-profit hospitals",
    // Updated: this master prompt's Sub-Task A makes a bare scope filter
    // with no metric default to the domain's own declared default
    // ranking metric (hospital-overall-rating) instead of failing -
    // was "Unable to create query plan" before.
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => String(row.ownership ?? "").startsWith("Voluntary non-profit")),
  );
  await check(
    "GA6-CALIFORNIA-NONPROFIT-LOWEST-MORTALITY",
    "California non-profit hospitals with lowest mortality",
    (r, calls) =>
      r.success === true && calls > 0 &&
      (r.rows ?? []).every((row: any) => row.state === "CA" && String(row.ownership ?? "").startsWith("Voluntary non-profit")),
  );

  // Group B - condition-specific ranking, updated by B-full (see file
  // header): all 6 now genuinely succeed, scoped to the right
  // measure_code, instead of merely refusing safely.
  await check(
    "GB7-AMI-MORTALITY-NOW-ANSWERABLE-B-FULL",
    "Show me hospitals with best AMI mortality",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "MORT_30_AMI"),
  );
  await check(
    "GB8-CABG-READMISSION-NOW-ANSWERABLE-B-FULL",
    "Hospitals with lowest CABG readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-CABG-HRRP"),
  );
  await check(
    "GB9-COPD-READMISSION-NOW-ANSWERABLE-B-FULL",
    "Best hospitals for COPD readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-COPD-HRRP"),
  );
  await check(
    "GB10-HIPKNEE-READMISSION-NOW-ANSWERABLE-B-FULL",
    "Hospitals with best Hip/Knee readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-HIP-KNEE-HRRP"),
  );
  await check(
    "GB11-HEARTFAILURE-MORTALITY-NOW-ANSWERABLE-B-FULL",
    "Show me hospitals with lowest heart failure mortality",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "MORT_30_HF"),
  );
  await check(
    "GB12-PNEUMONIA-READMISSION-NOW-ANSWERABLE-B-FULL",
    "Hospitals with best pneumonia readmission",
    (r, calls) => r.success === true && calls > 0 && (r.rows ?? []).every((row: any) => row.measure_code === "READM-30-PN-HRRP"),
  );

  // Group C - controls, unaffected.
  await check("GC13-LOWEST-MORTALITY-CONTROL", "hospitals with lowest mortality", (r) => r.success === true);
  await check("GC14-TEXAS-LOWEST-MORTALITY-CONTROL", "Texas hospitals with lowest mortality", (r) => r.success === true);
  await check(
    "GC15-MAYO-ROCHESTER-CONTROL",
    "Mayo Clinic Rochester Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows?.[0]?.facility_id === "240010",
  );
  await check(
    "GC16-NATIONAL-MORTALITY-AVERAGE-V2-CONTROL",
    "California hospitals performing above national mortality average",
    (r, calls) => r.success === true && calls > 0,
  );
  await check(
    "GC17-NATIONAL-AVERAGE-MORTALITY-V2-CONTROL",
    "California hospitals performing above national average mortality",
    (r, calls) => r.success === true && calls > 0,
  );

  // Group D - Task1-3 preservation.
  await check(
    "GD18-MEMORIAL-HOSPITAL-TEXAS",
    "Memorial Hospital Texas",
    (r, calls) => r.success === false && r.answerability?.status === "ambiguous" && calls === 0,
  );
  await check(
    "GD19-BIRMINGHAM-9-ROWS",
    "Show me hospitals in Birmingham, Alabama with their overall ratings",
    (r) => r.success === true && r.rowCount === 9,
  );
  await check(
    "GD20-ALBANY-COUNTY-NY-QUALIFIED",
    "Show me the highest-rated hospitals in New York for ALBANY county",
    (r) => r.success === true && r.rowCount === 3,
  );
  await check(
    "GD21-ALBANY-COUNTY-BARE-AMBIGUOUS",
    "Show me the highest-rated hospitals in ALBANY county",
    (r, calls) => r.success === false && r.answerability?.status === "ambiguous" && calls === 0,
  );

  // Group E - arbitrary, unregistered ownership phrase must remain safe (directory is finite, not fuzzy).
  await check(
    "GE22-ARBITRARY-OWNERSHIP-PHRASE-STILL-SAFE",
    "Show me xyz-owned hospitals with lowest mortality",
    (r) => r.success === true, // "xyz-owned" never resolves as any candidate, so this degrades to the unfiltered control - safe, not a silent ownership claim
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
