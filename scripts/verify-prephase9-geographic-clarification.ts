/**
 * Pre-Phase 9 Tier0: Geographic Clarification Restoration.
 *
 * Verifies that a geographic filter (county/city) whose value collides
 * across multiple states triggers the Phase 8.3 ambiguity/clarification
 * gate (status: "ambiguous", zero SQL) instead of the removed
 * "SQL template not found" / "Unable to create query plan" hack, and that
 * the Phase 8.10 Layer 2 two-turn continuation flow resolves it correctly
 * against the real, remote database.
 *
 * Run: npx tsx scripts/verify-prephase9-geographic-clarification.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import {
  createPendingInteraction,
  matchClarificationResponse,
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

const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
});

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

// Spy-instrumented executor to count real SQL calls for the Phase 8.13
// invariant (ambiguous ⟹ SQL=0), without touching the real executor used
// for every other test.
function countingExecutor() {
  let calls = 0;
  const spy = {
    execute: async (...args: Parameters<typeof executor.execute>) => {
      calls++;
      return executor.execute(...args);
    },
  };
  return { spy, getCalls: () => calls };
}

async function test1_AlbanyCountyAmbiguous() {
  const { spy, getCalls } = countingExecutor();
  const spyEngine = createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: spy as unknown as typeof executor,
  });

  const result = await spyEngine.execute({
    question: "Show me the highest-rated hospitals in ALBANY county",
  });

  const status = result.answerability?.status;
  const candidateValues = (result.answerability?.candidates ?? []).map(
    (c: any) => c.value,
  );

  const pass =
    status === "ambiguous" &&
    result.answerability?.reason === "identity-ambiguous" &&
    candidateValues.includes("NY") &&
    candidateValues.includes("WY") &&
    getCalls() === 0;

  record(
    "T1-ALBANY-COUNTY-AMBIGUOUS",
    pass,
    `status=${status} candidates=${JSON.stringify(candidateValues)} sqlCalls=${getCalls()}`,
  );

  return result;
}

async function test2_Turn2Continuation() {
  // Turn 1: create the pending interaction the way the orchestrator's
  // chat.ts handler does for any identity-ambiguous answerability.
  const turn1 = await engine.execute({
    question: "Show me the highest-rated hospitals in ALBANY county",
  });

  if (turn1.answerability?.status !== "ambiguous") {
    record("T2-TURN2-CONTINUATION", false, "Turn 1 did not report ambiguous - cannot test continuation");
    return;
  }

  const offeredOptions = (turn1.answerability.candidates ?? []).map((c: any) => ({
    facility_id: c.value,
    hospital_name: "",
    city: c.label,
    state: "",
    displayLabel: c.label,
  }));

  const interaction = await createPendingInteraction(client, {
    kind: "clarification",
    originalQuestion: "Show me the highest-rated hospitals in ALBANY county",
    originalSemanticResult: {},
    pendingTarget: { entityMention: "ALBANY county", candidates: turn1.answerability.candidates },
    offeredOptions,
  });

  const selected = matchClarificationResponse("New York", offeredOptions);

  if (!selected) {
    record("T2-TURN2-CONTINUATION", false, "Turn 2 response 'New York' did not match any offered option");
    return;
  }

  const reconstructedQuestion = `${interaction.originalQuestion} in ${selected.city}`;
  const turn2 = await engine.execute({ question: reconstructedQuestion });

  const pass =
    turn2.answerability?.status === "answerable" &&
    turn2.rowCount === 3;

  record(
    "T2-TURN2-CONTINUATION",
    pass,
    `reconstructed="${reconstructedQuestion}" status=${turn2.answerability?.status} rowCount=${turn2.rowCount}`,
  );
}

async function test3_BestHospitalNoLongerCrashes() {
  const result = await engine.execute({ question: "Best Hospital in ALBANY county" });

  const pass = result.error !== "Unable to create query plan.";

  record(
    "T3-BEST-HOSPITAL-NO-CRASH",
    pass,
    `status=${result.answerability?.status} reason=${result.answerability?.reason} error="${result.error}"`,
  );
}

async function test4_StatePrequalifiedAnswerable() {
  const result = await engine.execute({
    question: "Show me the highest-rated hospitals in New York for ALBANY county",
  });

  const pass = result.answerability?.status === "answerable" && result.rowCount === 3;

  record(
    "T4-STATE-PREQUALIFIED-ANSWERABLE",
    pass,
    `status=${result.answerability?.status} rowCount=${result.rowCount}`,
  );
}

async function test5_BestHospitalStatePrequalified() {
  const result = await engine.execute({
    question: "Best Hospital in New York for ALBANY county",
  });

  const pass = result.success === true && result.rowCount === 3;

  record(
    "T5-BEST-HOSPITAL-STATE-PREQUALIFIED",
    pass,
    `success=${result.success} rowCount=${result.rowCount} error="${result.error}"`,
  );
}

async function test6_BirminghamRegression() {
  const result = await engine.execute({
    question: "Show me hospitals in Birmingham, Alabama with their overall ratings",
  });

  const pass = result.success === true && result.rowCount === 9;

  record("T6-BIRMINGHAM-REGRESSION", pass, `success=${result.success} rowCount=${result.rowCount}`);
}

async function test7_ByCountyGroupingUnaffected() {
  const result = await engine.execute({
    question: "Show me the highest-rated hospitals in New York by county",
  });

  const pass = result.success === true && result.rowCount === 52;

  record("T7-BY-COUNTY-GROUPING-UNAFFECTED", pass, `success=${result.success} rowCount=${result.rowCount}`);
}

async function test8_HarrisCountySingleStateUnambiguous() {
  const result = await engine.execute({
    question: "Show me the highest-rated hospitals in Harris County",
  });

  // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
  // same-day true-raw fix): back to the original top-10 ceiling
  // (multiState=false path) - the true-raw turn's ">10" relaxation is
  // no longer needed.
  const pass = result.answerability?.status === "answerable" && result.rowCount === 10;

  record(
    "T8-HARRIS-COUNTY-SINGLE-STATE",
    pass,
    `status=${result.answerability?.status} rowCount=${result.rowCount}`,
  );
}

async function main() {
  console.log("=".repeat(80));
  console.log("PRE-PHASE 9 TIER0: GEOGRAPHIC CLARIFICATION RESTORATION");
  console.log("=".repeat(80));

  await test1_AlbanyCountyAmbiguous();
  await test2_Turn2Continuation();
  await test3_BestHospitalNoLongerCrashes();
  await test4_StatePrequalifiedAnswerable();
  await test5_BestHospitalStatePrequalified();
  await test6_BirminghamRegression();
  await test7_ByCountyGroupingUnaffected();
  await test8_HarrisCountySingleStateUnambiguous();

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  console.log(`Total: ${results.length}  PASS: ${passed}  FAIL: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  ${r.id}: ${r.detail}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
