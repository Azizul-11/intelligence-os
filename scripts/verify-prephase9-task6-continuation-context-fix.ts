/**
 * Tier0 Task 6 Fix Verification: Disambiguation Turn-2 Context Preservation.
 *
 * Live, in-process, spy-instrumented verification of Option A (structural
 * identity injection + full Turn 1 context capture) against the remote
 * Supabase warehouse. Reproduces the real two-turn continuation flow using
 * the actual, unmodified `@intelligence/runtime-engine` exports
 * (createPendingInteraction, retrievePendingInteraction,
 * matchClarificationResponse, reconstructClarificationRequest,
 * reconstructHospitalChoice) plus the *fixed* orchestrator glue logic
 * (chat.ts's offeredOptions construction + originalSemanticResult capture;
 * continuation.ts's forcedIdentityCandidate injection + fallback-scope
 * narrowing) reproduced inline, since those live in Deno-only edge function
 * files not importable into this Node/tsx script. The reproduced glue is
 * byte-for-byte the same logic as the deployed source after this task's
 * fix (see supabase/functions/orchestrator/{handlers/chat.ts,
 * services/continuation.ts}).
 *
 * Run: npx tsx scripts/verify-prephase9-task6-continuation-context-fix.ts
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
  reconstructClarificationRequest,
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

// Reproduces domain-registry.ts's lookupHospitalOverallRating() exactly
// (Deno-only file, not importable here) — same template, same executor.
async function lookupHospitalOverallRating(facilityId: string) {
  const template = runtime.sqlResolver.resolve("hospital-overall-rating");
  if (!template.found || !template.template) {
    return { success: false, rows: [] as any[], rowCount: 0, error: "Lookup template unavailable" };
  }
  return executor.execute(template.template, { hospitalId: facilityId });
}

// Reproduces chat.ts's FIXED offeredOptions construction (3-part label
// split: "CITY, COUNTY County, STATE").
function buildOfferedOptions(candidates: any[]) {
  return candidates.map((candidate: any) => {
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

/**
 * Runs one full two-turn simulation, mirroring the FIXED chat.ts (Turn 1)
 * + continuation.ts (Turn 2) exactly.
 */
async function simulateTwoTurn(
  turn1Question: string,
  turn2Response: string,
): Promise<{
  turn1: { success: boolean; answerability?: any; candidateCount: number; rawCandidates: any[] };
  turn2: {
    reconstructedQuestion: string;
    identityAlreadyResolved?: boolean;
    forcedIdentityCandidate?: { value: unknown };
    hadMetricOrConcept: boolean;
    result: any;
    rawTurn2Success?: boolean;
    rawTurn2Answerability?: any;
    sqlCalls: number;
    usedFallback: boolean;
  } | null;
}> {
  // --- Turn 1 (mirrors FIXED chat.ts) ---
  const { spyEngine: turn1Engine } = countingEngine();
  const turn1Result = await turn1Engine.execute({ question: turn1Question });

  if (
    turn1Result.success ||
    turn1Result.answerability?.status !== "ambiguous" ||
    turn1Result.answerability?.reason !== "identity-ambiguous" ||
    !turn1Result.answerability?.candidates?.length
  ) {
    return {
      turn1: {
        success: turn1Result.success,
        answerability: turn1Result.answerability,
        candidateCount: turn1Result.answerability?.candidates?.length ?? 0,
        rawCandidates: turn1Result.answerability?.candidates ?? [],
      },
      turn2: null,
    };
  }

  const offeredOptions = buildOfferedOptions(turn1Result.answerability.candidates);

  const interaction = await createPendingInteraction(client, {
    kind: "clarification",
    originalQuestion: turn1Question,
    // Tier0 Task 6 fix: the real semantic matches this Turn already
    // resolved (metric/concept/etc), not an empty placeholder.
    originalSemanticResult: (turn1Result as any).semanticMatches ?? [],
    pendingTarget: { entityMention: turn1Question, candidates: turn1Result.answerability.candidates },
    offeredOptions,
  });

  // --- Turn 2 (mirrors FIXED continuation.ts) ---
  const retrieved = await retrievePendingInteraction(client, interaction.id);
  const selectedOption = matchClarificationResponse(turn2Response, retrieved.offeredOptions as any[]);

  if (!selectedOption) {
    await consumePendingInteraction(client, interaction.id);
    return {
      turn1: {
        success: turn1Result.success,
        answerability: turn1Result.answerability,
        candidateCount: turn1Result.answerability.candidates.length,
        rawCandidates: turn1Result.answerability.candidates,
      },
      turn2: {
        reconstructedQuestion: "<no match>",
        hadMetricOrConcept: false,
        result: { success: false, error: "matchClarificationResponse returned null" },
        sqlCalls: 0,
        usedFallback: false,
      },
    };
  }

  const hospitalChoice = reconstructHospitalChoice(selectedOption);

  if (hospitalChoice?.kind === "lookup") {
    await consumePendingInteraction(client, interaction.id);
    const lookupResult = await lookupHospitalOverallRating(hospitalChoice.facilityId);
    return {
      turn1: {
        success: turn1Result.success,
        answerability: turn1Result.answerability,
        candidateCount: turn1Result.answerability.candidates.length,
        rawCandidates: turn1Result.answerability.candidates,
      },
      turn2: {
        reconstructedQuestion: "<F8 lookup-choice bypass, no NL reconstruction>",
        identityAlreadyResolved: true,
        hadMetricOrConcept: false,
        result: lookupResult,
        sqlCalls: 1,
        usedFallback: true,
      },
    };
  }

  const reconResult = reconstructClarificationRequest(retrieved, selectedOption);
  const locationQualifier = [selectedOption.city, selectedOption.state].filter(Boolean).join(", ");
  const forcedIdentityCandidate = { value: (reconResult.forcedIdentity as any)?.facility_id };
  const reconstructed = {
    question: locationQualifier ? `${retrieved.originalQuestion} in ${locationQualifier}` : retrieved.originalQuestion,
    forcedCandidate: selectedOption,
    forcedIdentityCandidate,
    identityAlreadyResolved: true,
  };

  await consumePendingInteraction(client, interaction.id);

  const { spyEngine: turn2Engine, getCalls } = countingEngine();
  const turn2Result = await turn2Engine.execute({
    question: reconstructed.question,
    parameters: {},
    identityAlreadyResolved: reconstructed.identityAlreadyResolved,
    forcedIdentityCandidate: reconstructed.forcedIdentityCandidate,
  } as any);

  const hadMetricOrConcept =
    Array.isArray(retrieved.originalSemanticResult) &&
    (retrieved.originalSemanticResult as any[]).some(
      (match) => match?.semanticType === "metric" || match?.semanticType === "concept",
    );

  let usedFallback = false;
  let finalResult = turn2Result;
  const rawTurn2Answerability = turn2Result.answerability;

  if (!turn2Result.success) {
    const facilityId = reconstructed.forcedCandidate?.facility_id;
    if (typeof facilityId === "string" && reconstructed.identityAlreadyResolved && !hadMetricOrConcept) {
      const fallbackResult = await lookupHospitalOverallRating(facilityId);
      if (fallbackResult.success) {
        usedFallback = true;
        finalResult = { success: true, rows: fallbackResult.rows, rowCount: fallbackResult.rowCount, answerability: { status: "answerable" } };
      }
    }
  }

  return {
    turn1: {
      success: turn1Result.success,
      answerability: turn1Result.answerability,
      candidateCount: turn1Result.answerability.candidates.length,
      rawCandidates: turn1Result.answerability.candidates,
    },
    turn2: {
      reconstructedQuestion: reconstructed.question,
      identityAlreadyResolved: reconstructed.identityAlreadyResolved,
      forcedIdentityCandidate,
      hadMetricOrConcept,
      result: finalResult,
      rawTurn2Success: turn2Result.success,
      rawTurn2Answerability,
      sqlCalls: getCalls(),
      usedFallback,
    },
  };
}

function measureCodes(rows: any[]): string[] {
  return [...new Set(rows.map((r) => r.measure_code).filter((v) => v !== undefined))];
}

function findByFacility(rows: any[], facilityId: string) {
  return rows.filter((r) => r.facility_id === facilityId);
}

async function main() {
  console.log("=".repeat(90));
  console.log("TIER0 TASK 6 FIX VERIFICATION: CONTINUATION CONTEXT PRESERVATION");
  console.log("=".repeat(90));

  // --- DB ground truth (hardcoding re-confirmation) ---
  const { data: memorialRows, error: memorialErr } = await client
    .from("warehouse_hospitals")
    .select("facility_id, hospital_name, city, state, county, ownership, overall_rating")
    .eq("hospital_name", "MEMORIAL HOSPITAL")
    .order("state")
    .order("city");
  record(
    "DB-0-MEMORIAL-EXACT-COUNT",
    !memorialErr && (memorialRows?.length ?? 0) === 12,
    `rowCount=${memorialRows?.length} facilities=${JSON.stringify(memorialRows?.map((r) => `${r.facility_id}:${r.city},${r.state}`))}`,
  );

  const { data: belleville } = await client
    .from("warehouse_hospital_clinical_outcomes")
    .select("facility_id, measure_code, score")
    .eq("facility_id", "140185")
    .eq("measure_code", "MORT_30_AMI");
  record("DB-1-BELLEVILLE-MORT30AMI", (belleville?.length ?? 0) === 1, `rows=${JSON.stringify(belleville)}`);

  // ============================================================
  // GROUP A — Memorial Hospital ambiguity + condition (the reported bug)
  // ============================================================
  console.log("\n--- GROUP A: Memorial Hospital + condition (fix target) ---");

  const a1 = await simulateTwoTurn(
    "What is Memorial Hospital's mortality rate for heart attack specifically?",
    "BELLEVILLE",
  );
  record("GA-1-TURN1-AMBIGUOUS-12WAY", a1.turn1.candidateCount === 12, `candidateCount=${a1.turn1.candidateCount}`);
  if (a1.turn2) {
    const rows = (a1.turn2.result.rows ?? []) as any[];
    record(
      "GA-2-TURN2-BELLEVILLE-SUCCESS-MORT30AMI",
      a1.turn2.result.success === true &&
        !a1.turn2.usedFallback &&
        rows.length === 1 &&
        rows[0]?.facility_id === "140185" &&
        rows[0]?.measure_code === "MORT_30_AMI" &&
        Number(rows[0]?.score) === 9.7,
      `success=${a1.turn2.result.success} usedFallback=${a1.turn2.usedFallback} rawTurn2Success=${a1.turn2.rawTurn2Success} rawAnswerability=${JSON.stringify(a1.turn2.rawTurn2Answerability)} sqlCalls=${a1.turn2.sqlCalls} rowCount=${rows.length} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code} score=${rows[0]?.score}`,
    );
  }

  const a2 = await simulateTwoTurn(
    "What is Memorial Hospital's mortality rate for heart attack specifically?",
    "CARTHAGE",
  );
  if (a2.turn2) {
    const rows = (a2.turn2.result.rows ?? []) as any[];
    record(
      "GA-3-TURN2-CARTHAGE-DIFFERENT-FACILITY-SAME-CONDITION",
      a2.turn2.result.success === true && rows.length === 1 && rows[0]?.facility_id === "141305" && rows[0]?.measure_code === "MORT_30_AMI",
      `success=${a2.turn2.result.success} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code} (proves generic, not per-hospital)`,
    );
  }

  const a3 = await simulateTwoTurn(
    "What is Memorial Hospital's readmission rate for CABG specifically?",
    "GONZALES",
  );
  if (a3.turn2) {
    const rows = (a3.turn2.result.rows ?? []) as any[];
    record(
      "GA-4-TURN2-GONZALES-TX-CABG-READMISSION",
      a3.turn2.result.success === true && rows.length === 1 && rows[0]?.facility_id === "450235",
      `success=${a3.turn2.result.success} facility_id=${rows[0]?.facility_id} row=${JSON.stringify(rows[0])}`,
    );
  }

  const a4 = await simulateTwoTurn("What is Memorial Hospital's overall rating?", "BELLEVILLE");
  if (a4.turn2) {
    const rows = (a4.turn2.result.rows ?? []) as any[];
    record(
      "GA-5-BARE-IDENTITY-NO-METRIC-FALLBACK-ALLOWED",
      a4.turn2.result.success === true && rows.length === 1 && rows[0]?.facility_id === "140185" && rows[0]?.overall_rating !== undefined,
      `success=${a4.turn2.result.success} usedFallback=${a4.turn2.usedFallback} hadMetricOrConcept=${a4.turn2.hadMetricOrConcept} facility_id=${rows[0]?.facility_id} overall_rating=${rows[0]?.overall_rating}`,
    );
  }

  const a5 = await simulateTwoTurn("Memorial Hospital Texas", "GONZALES");
  if (a5.turn2) {
    const rows = (a5.turn2.result.rows ?? []) as any[];
    record(
      "GA-6-MEMORIAL-TEXAS-NO-METRIC-CONTROL",
      a5.turn2.result.success === true && rows.length === 1 && rows[0]?.facility_id === "450235",
      `success=${a5.turn2.result.success} facility_id=${rows[0]?.facility_id}`,
    );
  }

  const a6 = await simulateTwoTurn(
    "Memorial Hospital Texas mortality rate for heart attack specifically?",
    "GONZALES",
  );
  if (a6.turn2) {
    const rows = (a6.turn2.result.rows ?? []) as any[];
    record(
      "GA-7-MEMORIAL-TEXAS-PLUS-CONDITION-ALL-FILTERS-PRESERVED",
      a6.turn2.result.success === true && rows.length === 1 && rows[0]?.facility_id === "450235" && rows[0]?.measure_code === "MORT_30_AMI",
      `success=${a6.turn2.result.success} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code}`,
    );
  }

  // ============================================================
  // GROUP B — Mayo controls
  // ============================================================
  console.log("\n--- GROUP B: Mayo Clinic controls ---");
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "What is Mayo Clinic's mortality rate for heart attack specifically?" });
    const rows = (r.rows ?? []) as any[];
    record("GB-1-MAYO-UNAMBIGUOUS-AMI", r.success === true && rows.length === 1 && rows[0]?.measure_code === "MORT_30_AMI" && rows[0]?.facility_id === "100151", `success=${r.success} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code} sqlCalls=${getCalls()}`);
  }
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Mayo Clinic best AMI mortality" });
    record("GB-2-MAYO-RANKING-F8-AMBIGUITY", r.success === false && r.answerability?.status === "ambiguous" && getCalls() === 0, `success=${r.success} status=${r.answerability?.status} sqlCalls=${getCalls()}`);
  }
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Compare Mayo Clinic Jacksonville and Cleveland Clinic" });
    record("GB-3-COMPARE-MAYO-CLEVELAND", r.success === true, `success=${r.success} rowCount=${r.rowCount} sqlCalls=${getCalls()}`);
  }

  // ============================================================
  // GROUP C — condition-only ranking control
  // ============================================================
  console.log("\n--- GROUP C: condition-only ranking ---");
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me hospitals with best AMI mortality" });
    const rows = (r.rows ?? []) as any[];
    // Tier1 Task 5 balanced-limits fix (2026-09-12, supersedes the
    // same-day true-raw fix): back to the original top-10 ceiling
    // (multiState=false path). Still correctly scoped to MORT_30_AMI.
    record("GC-1-BARE-AMI-RANKING", r.success === true && rows.length === 10 && measureCodes(rows).every((m) => m === "MORT_30_AMI"), `success=${r.success} rowCount=${rows.length} measure_codes=${JSON.stringify(measureCodes(rows))} sqlCalls=${getCalls()}`);
  }
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Hospitals with lowest CABG readmission" });
    record("GC-2-CABG-READMISSION-RANKING", r.success === true && (r.rowCount ?? 0) > 0, `success=${r.success} rowCount=${r.rowCount} sqlCalls=${getCalls()}`);
  }

  // ============================================================
  // GROUP D — synonyms
  // ============================================================
  console.log("\n--- GROUP D: condition synonyms ---");
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me hospitals with best heart attack mortality" });
    const rows = (r.rows ?? []) as any[];
    record("GD-1-HEART-ATTACK-SYNONYM-AMI", r.success === true && measureCodes(rows).every((m) => m === "MORT_30_AMI"), `success=${r.success} measure_codes=${JSON.stringify(measureCodes(rows))}`);
  }
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Hospitals with best HF readmission" });
    record("GD-2-HF-SYNONYM-HEART-FAILURE", r.success === true && (r.rowCount ?? 0) > 0, `success=${r.success} rowCount=${r.rowCount}`);
  }

  // ============================================================
  // GROUP E — combined ownership+condition, state+condition
  // ============================================================
  console.log("\n--- GROUP E: combined filters ---");
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me non-profit hospitals with best AMI mortality" });
    const rows = (r.rows ?? []) as any[];
    record("GE-1-OWNERSHIP-PLUS-CONDITION", r.success === true && measureCodes(rows).every((m) => m === "MORT_30_AMI") && rows.every((row: any) => String(row.ownership ?? "").startsWith("Voluntary non-profit")), `success=${r.success} measure_codes=${JSON.stringify(measureCodes(rows))} ownership=${JSON.stringify([...new Set(rows.map((r: any) => r.ownership))])}`);
  }
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Texas hospitals with lowest CABG readmission" });
    record("GE-2-STATE-PLUS-CONDITION", r.success === true && (r.rowCount ?? 0) > 0, `success=${r.success} rowCount=${r.rowCount}`);
  }

  // ============================================================
  // GROUP F — bare scope-filter list intent (Task 5 Sub-Task A)
  // ============================================================
  console.log("\n--- GROUP F: bare scope-filter list intent ---");
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me non-profit hospitals" });
    const rows = (r.rows ?? []) as any[];
    record("GF-1-BARE-NONPROFIT", r.success === true && rows.every((row: any) => String(row.ownership ?? "").startsWith("Voluntary non-profit")), `success=${r.success} rowCount=${rows.length}`);
  }
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me government hospitals" });
    record("GF-2-BARE-GOVERNMENT", r.success === true, `success=${r.success} rowCount=${r.rowCount}`);
  }

  // ============================================================
  // GROUP G — Task 1-5 preservation controls
  // ============================================================
  console.log("\n--- GROUP G: Task 1-5 preservation controls ---");
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me hospitals with best overall rating" });
    record("GG-1-BARE-MORTALITY-RANKING", r.success === true, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "What is Mayo Clinic Rochester Minnesota's overall rating?" });
    const rows = (r.rows ?? []) as any[];
    record("GG-2-MAYO-ROCHESTER", r.success === true && rows[0]?.facility_id === "240010", `success=${r.success} facility_id=${rows[0]?.facility_id}`);
  }
  {
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me hospitals in Birmingham, Alabama with their overall ratings" });
    record("GG-3-BIRMINGHAM-9ROWS", r.success === true && r.rowCount === 9, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    // Established baseline (verify-prephase9-geographic-filtering.ts):
    // "Show me hospitals in ALBANY County, New York" → 4 rows, not 3 (the
    // 3-row figure belongs to a DIFFERENT, ranking-shaped phrasing in
    // verify-prephase9-geographic-clarification.ts).
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me hospitals in ALBANY County, New York" });
    record("GG-4-ALBANY-NY-4ROWS", r.success === true && (r.rowCount ?? 0) === 4, `success=${r.success} rowCount=${r.rowCount}`);
  }
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "ALBANY county hospitals" });
    record("GG-5-BARE-ALBANY-AMBIGUOUS", r.success === false && r.answerability?.status === "ambiguous" && getCalls() === 0, `success=${r.success} status=${r.answerability?.status} sqlCalls=${getCalls()}`);
  }
  {
    // Established baseline (verify-prephase9-task4-f1-real-fix-v2.ts): the
    // national-average benchmark only resolves as a comparison operand
    // (a "relationship" pairing, e.g. "above national mortality average"),
    // not as a bare stand-alone question - a different, unsupported shape.
    const { spyEngine } = countingEngine();
    const r = await spyEngine.execute({ question: "California hospitals performing above national mortality average" });
    record("GG-6-NATIONAL-MORTALITY-AVERAGE", r.success === true, `success=${r.success} rowCount=${r.rowCount}`);
  }

  console.log("\n" + "=".repeat(90));
  const passed = results.filter((r) => r.passed).length;
  console.log(`SUMMARY: ${passed}/${results.length} PASS`);
  console.log("=".repeat(90));

  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
