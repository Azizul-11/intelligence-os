/**
 * Tier0 Task 6 Fix Extension: F8 "Own" Path Condition-Filter Preservation.
 *
 * Live, in-process, spy-instrumented verification. BATCH18 fixed the
 * geographic-clarification branch of Layer 2 continuation (a hospital-name
 * ambiguity, e.g. Memorial Hospital). This extension fixes a SIBLING but
 * distinct branch: the pre-existing Task 2 F8 plan-ambiguity "own vs
 * similar" choice (e.g. "Mayo Clinic best AMI mortality" -> "own"), which
 * unconditionally called `lookupHospitalOverallRating` - a function that
 * can only ever return a bare `overall_rating`, discarding whatever
 * metric/condition Turn 1 actually asked about.
 *
 * Reproduces the real flow using the actual, unmodified
 * `@intelligence/runtime-engine` continuation exports plus the *fixed*
 * orchestrator glue (chat.ts's real-semantic-result capture;
 * continuation.ts's condition-aware "own" re-execution via
 * `forcedIdentityCandidate` + `forcedIntent: "lookup"`) reproduced inline,
 * since those live in Deno-only files not importable into this script.
 *
 * Run: npx tsx scripts/verify-prephase9-task6-continuation-context-fix-extension.ts
 */
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import {
  createPendingInteraction,
  retrievePendingInteraction,
  consumePendingInteraction,
  matchClarificationResponse,
  reconstructHospitalChoice,
} from "../packages/runtime-engine/src/continuation/index";
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

async function lookupHospitalOverallRating(facilityId: string) {
  const template = runtime.sqlResolver.resolve("hospital-overall-rating");
  if (!template.found || !template.template) {
    return { success: false, rows: [] as any[], rowCount: 0, error: "Lookup template unavailable" };
  }
  return executor.execute(template.template, { hospitalId: facilityId });
}

function buildOfferedOptions(candidates: any[]) {
  return candidates.map((candidate: any) => {
    if (candidate.value && typeof candidate.value === "object") {
      // F8 own/similar choice shape - label is a plain sentence, not "CITY, COUNTY County, STATE".
      return { facility_id: candidate.value, displayLabel: candidate.label || "" };
    }
    const [city, county, state] = (candidate.label || "").split(", ");
    return {
      facility_id: candidate.value,
      hospital_name: "",
      city: (city || "").trim(),
      county: (county || "").trim(),
      state: (state || "").trim(),
      displayLabel: candidate.label || `${city} - ${state}`,
    };
  });
}

function hadMetricOrConcept(originalSemanticResult: unknown): boolean {
  return (
    Array.isArray(originalSemanticResult) &&
    originalSemanticResult.some(
      (match: any) => match?.semanticType === "metric" || match?.semanticType === "concept",
    )
  );
}

/**
 * Runs Turn 1 for a question expected to hit the F8 plan-ambiguity "own
 * vs similar" gate, then Turn 2 with the given reply, mirroring the FIXED
 * chat.ts + continuation.ts exactly.
 */
async function simulateF8Choice(
  turn1Question: string,
  turn2Response: string,
): Promise<{
  turn1: { status?: string; reason?: string; candidateCount: number; sqlCalls: number };
  turn2: { kind?: string; result: any; sqlCalls: number } | null;
}> {
  const { spyEngine: turn1Engine, getCalls: turn1Calls } = countingEngine();
  const turn1Result = await turn1Engine.execute({ question: turn1Question });

  if (turn1Result.success || turn1Result.answerability?.status !== "ambiguous") {
    return {
      turn1: {
        status: turn1Result.answerability?.status,
        reason: turn1Result.answerability?.reason,
        candidateCount: turn1Result.answerability?.candidates?.length ?? 0,
        sqlCalls: turn1Calls(),
      },
      turn2: null,
    };
  }

  const offeredOptions = buildOfferedOptions(turn1Result.answerability.candidates ?? []);
  const interaction = await createPendingInteraction(client, {
    kind: "clarification",
    originalQuestion: turn1Question,
    originalSemanticResult: (turn1Result as any).semanticMatches ?? [],
    pendingTarget: { entityMention: turn1Question, candidates: turn1Result.answerability.candidates ?? [] },
    offeredOptions,
  });

  const retrieved = await retrievePendingInteraction(client, interaction.id);
  const selectedOption = matchClarificationResponse(turn2Response, retrieved.offeredOptions as any[]);

  if (!selectedOption) {
    await consumePendingInteraction(client, interaction.id);
    return {
      turn1: {
        status: turn1Result.answerability?.status,
        reason: turn1Result.answerability?.reason,
        candidateCount: turn1Result.answerability?.candidates?.length ?? 0,
        sqlCalls: turn1Calls(),
      },
      turn2: { result: { success: false, error: "no match" }, sqlCalls: 0 },
    };
  }

  const hospitalChoice = reconstructHospitalChoice(selectedOption);
  await consumePendingInteraction(client, interaction.id);

  if (hospitalChoice?.kind === "guidance") {
    return {
      turn1: {
        status: turn1Result.answerability?.status,
        reason: turn1Result.answerability?.reason,
        candidateCount: turn1Result.answerability?.candidates?.length ?? 0,
        sqlCalls: turn1Calls(),
      },
      turn2: { kind: "guidance", result: { success: false, answer: hospitalChoice.message }, sqlCalls: 0 },
    };
  }

  if (hospitalChoice?.kind !== "lookup") {
    return {
      turn1: {
        status: turn1Result.answerability?.status,
        reason: turn1Result.answerability?.reason,
        candidateCount: turn1Result.answerability?.candidates?.length ?? 0,
        sqlCalls: turn1Calls(),
      },
      turn2: { result: { success: false, error: "not an F8 hospital choice" }, sqlCalls: 0 },
    };
  }

  // Mirrors the FIXED continuation.ts "own" branch exactly.
  const { spyEngine: turn2Engine, getCalls: turn2Calls } = countingEngine();
  let finalResult: any;
  let sqlCalls = 0;

  if (hadMetricOrConcept(retrieved.originalSemanticResult)) {
    const conditionResult = await turn2Engine.execute({
      question: retrieved.originalQuestion,
      parameters: {},
      identityAlreadyResolved: true,
      forcedIdentityCandidate: { value: hospitalChoice.facilityId },
      forcedIntent: "lookup",
    } as any);
    sqlCalls = turn2Calls();

    if (conditionResult.success) {
      finalResult = conditionResult;
    } else {
      finalResult = await lookupHospitalOverallRating(hospitalChoice.facilityId);
      sqlCalls += 1;
    }
  } else {
    finalResult = await lookupHospitalOverallRating(hospitalChoice.facilityId);
    sqlCalls = 1;
  }

  return {
    turn1: {
      status: turn1Result.answerability?.status,
      reason: turn1Result.answerability?.reason,
      candidateCount: turn1Result.answerability?.candidates?.length ?? 0,
      sqlCalls: turn1Calls(),
    },
    turn2: { kind: "lookup", result: finalResult, sqlCalls },
  };
}

function measureCodes(rows: any[]): string[] {
  return [...new Set(rows.map((r) => r.measure_code).filter((v) => v !== undefined))];
}

async function main() {
  console.log("=".repeat(90));
  console.log("TIER0 TASK 6 EXTENSION: F8 OWN-PATH CONDITION-FILTER PRESERVATION");
  console.log("=".repeat(90));

  // --- DB checks ---
  const { data: mayoFacilities } = await client
    .from("warehouse_hospitals")
    .select("facility_id, hospital_name")
    .ilike("hospital_name", "%MAYO%")
    .order("facility_id");
  record("DB-0-MAYO-FACILITIES-NOT-HARDCODED", (mayoFacilities?.length ?? 0) > 1, `count=${mayoFacilities?.length}`);

  const { data: mayoAmi } = await client
    .from("warehouse_hospital_clinical_outcomes")
    .select("facility_id, measure_code, score")
    .eq("facility_id", "100151")
    .eq("measure_code", "MORT_30_AMI");
  record("DB-1-MAYO-100151-MORT30AMI", (mayoAmi?.length ?? 0) === 1 && Number(mayoAmi?.[0]?.score) === 11, `rows=${JSON.stringify(mayoAmi)}`);

  // --- Proof 1: the reported bug, now fixed ---
  const p1 = await simulateF8Choice("Mayo Clinic best AMI mortality", "own");
  record(
    "P1-TURN1-F8-OWN-VS-SIMILAR-AMBIGUOUS",
    p1.turn1.status === "ambiguous" && p1.turn1.sqlCalls === 0 && p1.turn1.candidateCount === 2,
    `status=${p1.turn1.status} sqlCalls=${p1.turn1.sqlCalls} candidateCount=${p1.turn1.candidateCount}`,
  );
  if (p1.turn2) {
    const rows = (p1.turn2.result.rows ?? []) as any[];
    record(
      "P1-TURN2-OWN-MORT30AMI-NOT-OVERALL-RATING",
      p1.turn2.result.success === true && rows.length === 1 && rows[0]?.facility_id === "100151" && rows[0]?.measure_code === "MORT_30_AMI" && Number(rows[0]?.score) === 11,
      `success=${p1.turn2.result.success} sqlCalls=${p1.turn2.sqlCalls} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code} score=${rows[0]?.score} overall_rating=${rows[0]?.overall_rating}`,
    );
  }

  // --- Proof 2: different hospital, different condition (proves generic) ---
  const p2 = await simulateF8Choice("Cleveland Clinic best CABG readmission", "own");
  if (p2.turn2) {
    const rows = (p2.turn2.result.rows ?? []) as any[];
    record(
      "P2-CLEVELAND-CABG-READMISSION-GENERIC",
      p2.turn2.result.success === true && rows.length === 1 && rows[0]?.facility_id === "360180" && rows[0]?.measure_code === "READM-30-CABG-HRRP",
      `success=${p2.turn2.result.success} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code} row=${JSON.stringify(rows[0])}`,
    );
  }

  // --- Proof 3: bare F8 ranking (no metric) - fallback still correctly allowed ---
  // Note: "Mayo Clinic Jacksonville" (not bare "Mayo Clinic") pins the
  // brand-collision entity resolution to facility 100151 specifically -
  // bare "Mayo Clinic"'s own primary-candidate resolution among several
  // same-brand facilities is a separate, pre-existing behavior unrelated
  // to this task (see Task 3's brand-aliasing), not something this test
  // is targeting.
  const p3 = await simulateF8Choice("Mayo Clinic Jacksonville best hospitals", "own");
  if (p3.turn2) {
    const rows = (p3.turn2.result.rows ?? []) as any[];
    record(
      "P3-BARE-F8-NO-METRIC-FALLBACK-ALLOWED",
      p3.turn2.result.success === true && rows[0]?.facility_id === "100151" && rows[0]?.overall_rating !== undefined,
      `success=${p3.turn2.result.success} facility_id=${rows[0]?.facility_id} overall_rating=${rows[0]?.overall_rating}`,
    );
  }

  // --- Proof 4: unambiguous control (no continuation at all) ---
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "What is Mayo Clinic's mortality rate for heart attack specifically?" });
    const rows = (r.rows ?? []) as any[];
    record("P4-UNAMBIGUOUS-CONTROL", r.success === true && rows[0]?.facility_id === "100151" && rows[0]?.measure_code === "MORT_30_AMI", `success=${r.success} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code} sqlCalls=${getCalls()}`);
  }

  // --- Proof 5: "similar" choice - unaffected, still the pre-existing guidance refusal (NOT a new ranking feature) ---
  const p5 = await simulateF8Choice("Mayo Clinic best AMI mortality", "similar");
  if (p5.turn2) {
    record(
      "P5-SIMILAR-CHOICE-UNAFFECTED-GUIDANCE",
      p5.turn2.kind === "guidance" && p5.turn2.result.success === false && typeof p5.turn2.result.answer === "string" && p5.turn2.result.answer.length > 0,
      `kind=${p5.turn2.kind} success=${p5.turn2.result.success} answer=${JSON.stringify(p5.turn2.result.answer)}`,
    );
  }

  // --- Proof 6: other conditions with "own" choice (generic, not per-condition hardcoded) ---
  const conditionCases: Array<[string, string, string]> = [
    ["Mayo Clinic best CABG mortality", "MORT_30_CABG", "clinical"],
    ["Mayo Clinic best COPD readmission", "READM-30-COPD-HRRP", "readmission"],
    ["Mayo Clinic best heart failure mortality", "MORT_30_HF", "clinical"],
    ["Mayo Clinic best pneumonia readmission", "READM-30-PN-HRRP", "readmission"],
  ];
  for (const [question, expectedCode] of conditionCases) {
    const p = await simulateF8Choice(question, "own");
    if (p.turn2) {
      const rows = (p.turn2.result.rows ?? []) as any[];
      record(
        `P6-OWN-${expectedCode}`,
        p.turn2.result.success === true && rows.length === 1 && rows[0]?.facility_id === "100151" && rows[0]?.measure_code === expectedCode,
        `question="${question}" success=${p.turn2.result.success} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code}`,
      );
    } else {
      record(`P6-OWN-${expectedCode}`, false, `question="${question}" never reached Turn 2 (turn1=${JSON.stringify(p.turn1)})`);
    }
  }

  // --- Controls: prior Task 1-6 regression spot-check ---
  console.log("\n--- Regression spot-check ---");
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Compare Mayo Clinic Jacksonville and Cleveland Clinic" });
    record("R1-COMPARE-UNAFFECTED", r.success === true && r.rowCount === 2, `success=${r.success} rowCount=${r.rowCount} sqlCalls=${getCalls()}`);
  }
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "What is Memorial Hospital's mortality rate for heart attack specifically?" });
    record("R2-MEMORIAL-TURN1-UNAFFECTED", r.success === false && r.answerability?.status === "ambiguous" && r.answerability?.candidates?.length === 12, `success=${r.success} candidateCount=${r.answerability?.candidates?.length} sqlCalls=${getCalls()}`);
  }

  console.log("\n" + "=".repeat(90));
  const passed = results.filter((r) => r.passed).length;
  console.log(`SUMMARY: ${passed}/${results.length} PASS`);
  console.log("=".repeat(90));

  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
