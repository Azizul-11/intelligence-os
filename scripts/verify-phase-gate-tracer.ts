/**
 * Tier0 Task 2 (F8) Phase 2: Query Tracer Observability — Verification Suite.
 *
 * Confirms, against the live remote database, that RuntimeResult.trace
 * (see packages/runtime-engine/src/phase-gate-tracker.ts) actually
 * reflects which of the 7 gates each specific query visited, and that a
 * request which stops early correctly shows the LATER gates as never
 * entered rather than silently appearing "complete".
 *
 * Run: npx tsx scripts/verify-phase-gate-tracer.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { PhaseGateTracker, CURRENT_GATES } from "../packages/runtime-engine/src/phase-gate-tracker";
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

interface TestResult { id: string; passed: boolean; detail: string; }
const results: TestResult[] = [];
function record(id: string, passed: boolean, detail: string) {
  results.push({ id, passed, detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${id} - ${detail}`);
}

function phasesVisited(trace: { phase: string }[] | undefined): string[] {
  return [...new Set((trace ?? []).map((g) => g.phase))];
}

async function test1_AnswerableVisitsAllSevenGates() {
  const result = await engine.execute({ question: "Best hospitals in Texas" });
  const visited = phasesVisited(result.trace);
  const pass = CURRENT_GATES.every((gate) => visited.includes(gate)) && result.success === true;
  record("T1-ANSWERABLE-ALL-7-GATES", pass, `visited=[${visited.join(",")}]`);
}

async function test2_GeographicAmbiguityStopsAtGate4() {
  const result = await engine.execute({ question: "Show me the highest-rated hospitals in ALBANY county" });
  const visited = phasesVisited(result.trace);
  const pass =
    visited.includes("plan-ambiguity-check") &&
    !visited.includes("capability-template-availability") &&
    !visited.includes("deterministic-warehouse-execution") &&
    result.answerability?.status === "ambiguous";
  record("T2-GEOGRAPHIC-AMBIGUITY-STOPS-GATE4", pass, `visited=[${visited.join(",")}]`);
}

async function test3_HospitalRankingAmbiguityStopsAtGate4() {
  const result = await engine.execute({ question: "Mayo Clinic best hospitals" });
  const visited = phasesVisited(result.trace);
  const pass =
    visited.includes("plan-ambiguity-check") &&
    !visited.includes("deterministic-warehouse-execution") &&
    result.answerability?.status === "ambiguous";
  record("T3-HOSPITAL-RANKING-AMBIGUITY-STOPS-GATE4", pass, `visited=[${visited.join(",")}]`);
}

async function test4_IdentityAmbiguityStopsAtGate2() {
  const result = await engine.execute({ question: "Northwest Medical Center overall rating" });
  const visited = phasesVisited(result.trace);
  const pass =
    visited.includes("entity-identity-ambiguity") &&
    !visited.includes("execution-plan-building") &&
    result.answerability?.status === "ambiguous";
  record("T4-IDENTITY-AMBIGUITY-STOPS-GATE2", pass, `visited=[${visited.join(",")}]`);
}

async function test5_UnsupportedCapabilityStopsAtGate5() {
  const result = await engine.execute({ question: "hospitals ranked by length of stay" });
  const visited = phasesVisited(result.trace);
  const pass =
    visited.includes("capability-template-availability") &&
    !visited.includes("deterministic-warehouse-execution") &&
    result.answerability?.reason === "capability-unavailable";
  record("T5-UNSUPPORTED-CAPABILITY-STOPS-GATE5", pass, `visited=[${visited.join(",")}]`);
}

async function test6_ComparisonVisitsAllGates() {
  const result = await engine.execute({ question: "Compare Mayo Clinic and Cleveland Clinic" });
  const visited = phasesVisited(result.trace);
  const pass = visited.includes("deterministic-warehouse-execution") && result.success === true;
  record("T6-COMPARISON-VISITS-EXECUTION-GATE", pass, `visited=[${visited.join(",")}]`);
}

async function test7_VerifyAllPhasesVisitedTrue() {
  const tracker = new PhaseGateTracker("test-7", "synthetic");
  for (const gate of CURRENT_GATES) tracker.enter(gate);
  const pass = tracker.verifyAllPhasesVisited(CURRENT_GATES) === true;
  record("T7-VERIFY-ALL-PHASES-TRUE", pass, `gates=${tracker.gates.length}`);
}

async function test8_VerifyAllPhasesVisitedFalseWhenPartial() {
  const tracker = new PhaseGateTracker("test-8", "synthetic");
  tracker.enter(CURRENT_GATES[0]!);
  tracker.enter(CURRENT_GATES[1]!);
  const pass = tracker.verifyAllPhasesVisited(CURRENT_GATES) === false;
  record("T8-VERIFY-ALL-PHASES-FALSE-PARTIAL", pass, `gates=${tracker.gates.length}`);
}

async function main() {
  console.log("=".repeat(80));
  console.log("QUERY TRACER OBSERVABILITY VERIFICATION");
  console.log("=".repeat(80));

  await test1_AnswerableVisitsAllSevenGates();
  await test2_GeographicAmbiguityStopsAtGate4();
  await test3_HospitalRankingAmbiguityStopsAtGate4();
  await test4_IdentityAmbiguityStopsAtGate2();
  await test5_UnsupportedCapabilityStopsAtGate5();
  await test6_ComparisonVisitsAllGates();
  await test7_VerifyAllPhasesVisitedTrue();
  await test8_VerifyAllPhasesVisitedFalseWhenPartial();

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(80));
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
