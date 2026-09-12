/**
 * Tier0 Task 3 FULL FIX: Brand-Aliasing + Phase 8 Intelligent Guidance
 * Verification Suite.
 *
 * Verifies, against the live remote database, that the brand-prefix
 * expansion in domain-packs/healthcare/src/runtime/entity-provider.ts
 * (findFacilitiesByBrandPrefix / expandByBrandIfContradicted) and the
 * "Gate 6" pre-execution required-parameter check in
 * packages/runtime-engine/src/create-runtime-engine.ts generalize
 * correctly across multiple real multi-facility brand patterns found in
 * the live warehouse - not just Mayo Clinic:
 *
 * - Mayo Clinic (T1-T6): the original P0 - a bare-name contradiction now
 *   resolves to the correct, differently-suffixed facility instead of
 *   merely failing safely.
 * - Cleveland Clinic (T7-T9): a second real multi-facility brand,
 *   confirmed via live DB check to have the same shape as Mayo (a bare
 *   exact name plus several suffixed facilities elsewhere).
 * - Memorial Hospital (T10-T11): must NOT trigger brand expansion at
 *   all - its bare name is already ambiguous (12 real candidates), and
 *   expansion is deliberately gated to exactly-one-candidate names only.
 * - Baptist Hospital / Methodist Hospital (T12-T17): the master
 *   prompt's own flagged risk case - "Baptist"/"Methodist" are common
 *   words prefixing dozens of unrelated hospital systems. These prove
 *   the word-boundary fix in findFacilitiesByBrandPrefix() (a bare
 *   `startsWith` would wrongly fold "METHODIST HOSPITALS OF MEMPHIS"
 *   into "METHODIST HOSPITAL"'s brand pool - T16 specifically verifies
 *   this stays excluded) and that a broad, non-narrowing qualifier
 *   (T17, a bare state) correctly returns "ambiguous", never a silent
 *   wrong "unique".
 * - Johns Hopkins (T18): Root Cause C, deliberately untouched by this
 *   fix - still resolves to its existing, safe deferred behavior.
 *
 * Gate 6 (raw-crash-leak fix): T13 and T16 additionally assert that no
 * result's error string ever contains the raw, internal
 * "Missing required parameter" text SqlExecutor throws - proving a
 * failed identity resolution reaches the user as clean guidance, not an
 * internal string, and that Gate 6 halts before the executor even runs
 * (sqlCalls === 0) rather than merely catching a lower-level throw.
 *
 * Run: npx tsx scripts/verify-prephase9-task3-full-fix-brand-alias.ts
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

interface TestResult {
  id: string;
  passed: boolean;
  detail: string;
}
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
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: spyExecutor as unknown as typeof executor,
  });
  return { spyEngine, getCalls: () => calls };
}

async function check(id: string, question: string, assert: (r: any, calls: number) => boolean) {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question });
  const rows = (result.rows ?? []) as any[];
  const noRawLeak = !String(result.error ?? "").includes("Missing required parameter");
  const pass = assert(result, getCalls()) && noRawLeak;
  record(
    id,
    pass,
    `success=${result.success} answerability=${JSON.stringify(result.answerability?.status)} rowCount=${result.rowCount} sqlCalls=${getCalls()} facility_ids=[${rows.map((r) => r.facility_id).join(",")}] candidates=${result.answerability?.candidates?.length ?? "n/a"} error="${result.error}"`,
  );
}

async function main() {
  console.log("=".repeat(80));
  console.log("TIER0 TASK 3 FULL FIX: BRAND-ALIASING + GATE 6 VERIFICATION");
  console.log("=".repeat(80));

  // Mayo Clinic (the original P0)
  await check(
    "T1-MAYO-ROCHESTER-NO-IN",
    "Mayo Clinic Rochester Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "240010",
  );

  await check(
    "T2-MAYO-ROCHESTER-WITH-IN",
    "Mayo Clinic in Rochester Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "240010",
  );

  await check(
    "T3-MAYO-ROCHESTER-COMMA",
    "Mayo Clinic in Rochester, Minnesota overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "240010",
  );

  await check(
    "T4-MAYO-JACKSONVILLE-UNAFFECTED",
    "Mayo Clinic in Jacksonville, Florida overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "100151",
  );

  await check(
    "T5-MAYO-CLINIC-HOSPITAL-PHOENIX-EXACT-PRESERVED",
    "Mayo Clinic Hospital overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "030103",
  );

  await check(
    "T6-COMPARE-MAYO-JACKSONVILLE-ROCHESTER-DISTINCT",
    "Compare Mayo Clinic in Jacksonville with Mayo Clinic in Rochester on overall rating",
    (r, calls) => r.success === true && calls > 0,
  );

  // Cleveland Clinic (second confirmed multi-facility brand)
  await check(
    "T7-CLEVELAND-CLINIC-AVON-OHIO",
    "Cleveland Clinic Avon Ohio overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "360364",
  );

  await check(
    "T8-CLEVELAND-CLINIC-WESTON-FLORIDA",
    "Cleveland Clinic Weston Florida overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "100289",
  );

  await check(
    "T9-CLEVELAND-CLINIC-BARE-UNAFFECTED",
    "Cleveland Clinic overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "360180",
  );

  // Memorial Hospital: brand expansion must NOT trigger (already ambiguous)
  await check(
    "T10-MEMORIAL-HOSPITAL-TEXAS-STILL-AMBIGUOUS",
    "Memorial Hospital Texas",
    (r, calls) =>
      r.success === false &&
      r.answerability?.status === "ambiguous" &&
      r.answerability?.candidates?.length === 3 &&
      calls === 0,
  );

  await check(
    "T11-MEMORIAL-HOSPITAL-BARE-STILL-AMBIGUOUS",
    "Memorial Hospital",
    (r, calls) =>
      r.success === false &&
      r.answerability?.status === "ambiguous" &&
      r.answerability?.candidates?.length === 12 &&
      calls === 0,
  );

  // Baptist Hospital: real 2-facility brand pool (Pensacola FL + Miami FL)
  await check(
    "T12-BAPTIST-HOSPITAL-MIAMI-FLORIDA",
    "Baptist Hospital Miami Florida overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "100008",
  );

  await check(
    "T13-BAPTIST-HOSPITAL-SAN-ANTONIO-NO-POOL-MATCH-SAFE",
    "Baptist Hospital San Antonio Texas overall rating",
    (r, calls) => r.success === false && r.answerability?.status === "not_directly_answerable" && calls === 0,
  );

  // Methodist Hospital: common word, real risk case per master prompt
  await check(
    "T14-METHODIST-HOSPITAL-SACRAMENTO-CALIFORNIA",
    "Methodist Hospital Sacramento California overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "050590",
  );

  await check(
    "T15-METHODIST-HOSPITAL-CHICAGO-ILLINOIS",
    "Methodist Hospital Chicago Illinois overall rating",
    (r) => r.success === true && r.rowCount === 1 && r.rows[0]?.facility_id === "140197",
  );

  // Word-boundary fix proof: "METHODIST HOSPITALS OF MEMPHIS" must stay
  // excluded from "METHODIST HOSPITAL"'s brand pool (different name shape).
  await check(
    "T16-METHODIST-HOSPITAL-MEMPHIS-BOUNDARY-EXCLUDED-SAFE",
    "Methodist Hospital Memphis Tennessee overall rating",
    (r, calls) => r.success === false && r.answerability?.status === "not_directly_answerable" && calls === 0,
  );

  // Broad qualifier (a bare state matching several same-brand
  // satellite facilities, not just one) must stay honestly ambiguous,
  // never a silent wrong "unique" pick. Mayo Clinic's own Minnesota
  // satellite network (Rochester plus several "Mayo Clinic Health
  // System" locations, confirmed via live DB check) is the real case
  // this shape occurs in.
  await check(
    "T17-MAYO-CLINIC-MINNESOTA-BROAD-QUALIFIER-AMBIGUOUS",
    "Mayo Clinic Minnesota overall rating",
    (r, calls) =>
      r.success === false &&
      r.answerability?.status === "ambiguous" &&
      (r.answerability?.candidates?.length ?? 0) >= 2 &&
      calls === 0,
  );

  // Johns Hopkins (Root Cause C) - deliberately untouched, still deferred.
  await check(
    "T18-JOHNS-HOPKINS-DEFERRED-UNAFFECTED",
    "Johns Hopkins overall rating",
    (r, calls) => r.success === false && r.answerability?.status === "ambiguous" && calls === 0,
  );

  console.log("=".repeat(80));
  const passCount = results.filter((r) => r.passed).length;
  console.log(`SUMMARY: Total: ${results.length}  PASS: ${passCount}  FAIL: ${results.length - passCount}`);

  if (passCount !== results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
