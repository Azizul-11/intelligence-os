/**
 * Tier0 Task 2: F8 Remediation via Clarification Gate — Verification Suite.
 *
 * Verifies the hospital-ranking clarification (HealthcareExecutionStrategy
 * .checkPlanAmbiguity's new branch) end to end against the live remote
 * database, including a real Turn 1 -> Turn 2 continuation round-trip
 * (replicating exactly what chat.ts/continuation.ts do, since those files
 * are Deno-only and not directly importable here - see
 * reconstruct-hospital-choice.ts, which both this script and the real
 * continuation.ts call identically), plus geographic/comparison
 * regression guards.
 *
 * Run: npx tsx scripts/verify-prephase9-f8-clarification.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import {
  matchClarificationResponse,
  reconstructHospitalChoice,
} from "../packages/runtime-engine/src/index";
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
const engine = createRuntimeEngine({ runtime, semantic, planner, executionPlanMapper: mapper, executor });

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
    runtime, semantic, planner, executionPlanMapper: mapper,
    executor: spyExecutor as unknown as typeof executor,
  });
  return { spyEngine, getCalls: () => calls };
}

// Replicates chat.ts's generic candidate -> offeredOptions mapping exactly,
// so this script exercises the same shape the real orchestrator produces.
function toOfferedOptions(candidates: any[]) {
  return candidates.map((candidate) => {
    const labelParts = (candidate.label || "").split(", ");
    const city = labelParts[0] || "";
    const state = labelParts[1] || "";
    return {
      facility_id: candidate.value,
      hospital_name: "",
      city: city.trim(),
      state: state.trim(),
      displayLabel: candidate.label || `${city} - ${state}`,
    };
  });
}

async function test1_MayoClinicBestHospitalsAmbiguous() {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question: "Mayo Clinic best hospitals" });

  const candidates = result.answerability?.candidates ?? [];
  const pass =
    result.answerability?.status === "ambiguous" &&
    result.answerability?.reason === "identity-ambiguous" &&
    candidates.length === 2 &&
    getCalls() === 0;

  record("T1-MAYO-BEST-HOSPITALS-AMBIGUOUS", pass, `status=${result.answerability?.status} candidates=${candidates.length} sqlCalls=${getCalls()}`);
  return result;
}

async function test2_Turn2Lookup() {
  const turn1 = await engine.execute({ question: "Mayo Clinic best hospitals" });
  const offeredOptions = toOfferedOptions(turn1.answerability?.candidates ?? []);

  const selected = matchClarificationResponse("own rating", offeredOptions);
  if (!selected) {
    record("T2-TURN2-LOOKUP", false, "Turn 2 reply did not match any offered option");
    return;
  }

  const reconstruction = reconstructHospitalChoice(selected);
  if (reconstruction?.kind !== "lookup") {
    record("T2-TURN2-LOOKUP", false, `expected kind=lookup, got ${JSON.stringify(reconstruction)}`);
    return;
  }

  // Deliberately bypasses engine.execute()'s NL pipeline for this choice -
  // see reconstruct-hospital-choice.ts for why. Replicates exactly what
  // domain-registry.ts's lookupHospitalOverallRating() does.
  const template = runtime.sqlResolver.resolve("hospital-overall-rating");
  if (!template.found || !template.template) {
    record("T2-TURN2-LOOKUP", false, "hospital-overall-rating template not found");
    return;
  }
  const lookupResult = await executor.execute(template.template, { hospitalId: reconstruction.facilityId });
  const rows = (lookupResult.rows ?? []) as any[];
  // Consistency check, not a hardcoded facility_id: whatever facility Turn 1's
  // ambiguity resolved to (see reconstruct-hospital-choice.ts's own comment on
  // why "Mayo Clinic" vs "Mayo Clinic Hospital" can genuinely be two different
  // real facilities - 100151 vs 030103 - depending on exact phrasing/rewrite
  // interaction), Turn 2's direct lookup must return exactly that same facility.
  const pass =
    lookupResult.success === true &&
    lookupResult.rowCount === 1 &&
    rows[0]?.facility_id === reconstruction.facilityId;

  record("T2-TURN2-LOOKUP", pass, `facilityId=${reconstruction.facilityId} success=${lookupResult.success} rowCount=${lookupResult.rowCount} returnedId=${rows[0]?.facility_id}`);
}

async function test3_Turn2Similar() {
  const turn1 = await engine.execute({ question: "Mayo Clinic best hospitals" });
  const offeredOptions = toOfferedOptions(turn1.answerability?.candidates ?? []);

  const selected = matchClarificationResponse("similar", offeredOptions);
  if (!selected) {
    record("T3-TURN2-SIMILAR", false, "Turn 2 reply 'similar' did not match any offered option");
    return;
  }

  const reconstruction = reconstructHospitalChoice(selected);
  const pass = reconstruction?.kind === "guidance" && !reconstruction.message.includes("cannot be safely represented");

  record("T3-TURN2-SIMILAR", pass, `kind=${reconstruction?.kind} message="${reconstruction && "message" in reconstruction ? reconstruction.message : ""}"`);
}

async function test4_HighestRatedForMayo() {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question: "highest rated hospital for Mayo Clinic" });
  const pass = result.answerability?.status === "ambiguous" && getCalls() === 0;
  record("T4-HIGHEST-RATED-FOR-MAYO", pass, `status=${result.answerability?.status} sqlCalls=${getCalls()}`);
}

async function test5_HighestRatedForCleveland() {
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question: "highest rated hospital for Cleveland Clinic" });
  const pass = result.answerability?.status === "ambiguous" && getCalls() === 0;
  record("T5-HIGHEST-RATED-FOR-CLEVELAND", pass, `status=${result.answerability?.status} sqlCalls=${getCalls()}`);
}

async function test6_BestHospitalsInTexasNoRegression() {
  const result = await engine.execute({ question: "Best hospitals in Texas" });
  // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
  // same-day true-raw fix): single-state ranking is capped at the
  // original top-10 ceiling again (multiState=false path) - the true-raw
  // turn's ">10" relaxation is no longer needed.
  const states = new Set((result.rows as any[] ?? []).map((r) => r.state));
  const pass = result.success === true && result.rowCount === 10 && states.size === 1 && states.has("TX");
  record("T6-TEXAS-NO-REGRESSION", pass, `success=${result.success} rowCount=${result.rowCount} states=${JSON.stringify([...states])}`);
}

async function test7_MultiStateNoRegression() {
  // Tier1 Task 5 (2026-09-12): this previously asserted the pre-Task-5
  // safe-refusal behavior (success=false, sqlCalls=0) as a "no
  // regression" guard. Task 5 Phase 1+2 deliberately made multi-state
  // ranking a real, working capability (see docs/pre-phase9/tier1-t5/) -
  // updated to assert the new, intended behavior instead of the old
  // refusal it superseded.
  const { spyEngine, getCalls } = countingEngine();
  const result = await spyEngine.execute({ question: "Best hospitals in Texas and California" });
  const pass = result.success === true && result.answerability?.status === "answerable" && getCalls() > 0;
  record("T7-MULTISTATE-NO-REGRESSION", pass, `success=${result.success} status=${result.answerability?.status} sqlCalls=${getCalls()}`);
}

async function test8_CompareNoRegression() {
  const result = await engine.execute({ question: "Compare Mayo Clinic and Cleveland Clinic" });
  const pass = result.success === true && result.rowCount === 2;
  record("T8-COMPARE-NO-REGRESSION", pass, `success=${result.success} rowCount=${result.rowCount}`);
}

async function main() {
  console.log("=".repeat(80));
  console.log("TIER0 TASK 2: F8 CLARIFICATION GATE VERIFICATION");
  console.log("=".repeat(80));

  await test1_MayoClinicBestHospitalsAmbiguous();
  await test2_Turn2Lookup();
  await test3_Turn2Similar();
  await test4_HighestRatedForMayo();
  await test5_HighestRatedForCleveland();
  await test6_BestHospitalsInTexasNoRegression();
  await test7_MultiStateNoRegression();
  await test8_CompareNoRegression();

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  const passed = results.filter((r) => r.passed).length;
  console.log(`Total: ${results.length}  PASS: ${passed}  FAIL: ${results.length - passed}`);
  if (passed < results.length) {
    results.filter((r) => !r.passed).forEach((r) => console.log(`  FAIL ${r.id}: ${r.detail}`));
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
