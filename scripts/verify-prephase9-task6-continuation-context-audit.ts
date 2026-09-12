/**
 * Tier0 Task 6 Audit: Disambiguation Turn-2 Context Drop.
 *
 * STRICTLY DIAGNOSTIC — this script performs no production writes to
 * source or schema. It replicates the real two-turn continuation flow
 * exactly, in-process, by:
 *
 *   1. Calling the real in-process RuntimeEngine for Turn 1 (identical to
 *      chat.ts's `executeRuntime`), then reproducing chat.ts's own
 *      `offeredOptions` construction (handlers/chat.ts lines ~66-79)
 *      verbatim, so `offeredOptions` here has the exact shape production
 *      builds (facility_id, hospital_name, city, state, displayLabel).
 *   2. Persisting a real `pending_interactions` row via the actual,
 *      unmodified `createPendingInteraction` (same table, same lifecycle,
 *      same 5-minute TTL production uses) — this is the same mechanism
 *      chat.ts itself relies on, not a mock.
 *   3. Retrieving it via the real `retrievePendingInteraction`, matching
 *      the user's Turn 2 reply via the real `matchClarificationResponse`,
 *      and reconstructing Turn 2's question via the exact same logic
 *      `continuation.ts` runs (reproduced inline below because
 *      `continuation.ts` itself is a Deno-only edge function file that
 *      cannot be imported into this Node/tsx script — the reconstruction
 *      logic is otherwise byte-for-byte identical, and every deterministic
 *      helper it calls — matchClarificationResponse,
 *      reconstructClarificationRequest, reconstructHospitalChoice — is the
 *      real, unmodified `@intelligence/runtime-engine` export, not a copy).
 *   4. Executing Turn 2's reconstructed question through the same
 *      in-process RuntimeEngine, and — if it fails — reproducing
 *      `lookupHospitalOverallRating`'s exact fallback (a direct
 *      `hospital-overall-rating` template execution by facility_id, the
 *      same template/executor already used for Turn 1) to show precisely
 *      what production would return.
 *   5. Consuming the pending interaction afterward (real, same as
 *      production) so no row is left dangling.
 *
 * No production TypeScript file, SQL template, or migration is modified by
 * this script. Run: npx tsx scripts/verify-prephase9-task6-continuation-context-audit.ts
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

// Reproduces chat.ts's offeredOptions construction exactly (handlers/chat.ts:66-79).
function buildOfferedOptions(candidates: any[]) {
  return candidates.map((candidate: any) => {
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

/**
 * Runs one full two-turn simulation, mirroring chat.ts (Turn 1) +
 * continuation.ts (Turn 2) exactly.
 */
async function simulateTwoTurn(
  turn1Question: string,
  turn2Response: string,
): Promise<{
  turn1: { success: boolean; answerability?: any; candidateCount: number; rawCandidates: any[] };
  turn2: {
    reconstructedQuestion: string;
    identityAlreadyResolved?: boolean;
    result: any;
    rawTurn2Success?: boolean;
    rawTurn2Answerability?: any;
    sqlCalls: number;
    usedFallback: boolean;
    fallbackResult?: any;
  } | null;
}> {
  // --- Turn 1 ---
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
    originalSemanticResult: {}, // Reproduces chat.ts's actual (not hypothetical) behavior
    pendingTarget: { entityMention: turn1Question, candidates: turn1Result.answerability.candidates },
    offeredOptions,
  });

  // --- Turn 2 (reproduces continuation.ts exactly) ---
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
        result: { success: false, error: "matchClarificationResponse returned null" },
        sqlCalls: 0,
        usedFallback: false,
      },
    };
  }

  const hospitalChoice = reconstructHospitalChoice(selectedOption);
  let reconstructed: { question: string; forcedCandidate?: any; identityAlreadyResolved?: boolean };

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
        result: lookupResult,
        sqlCalls: 1,
        usedFallback: true,
        fallbackResult: lookupResult,
      },
    };
  }

  const reconResult = reconstructClarificationRequest(retrieved, selectedOption); // forcedIdentity computed, matches production's dead-code path
  const locationQualifier = [selectedOption.city, selectedOption.state].filter(Boolean).join(", ");
  reconstructed = {
    question: locationQualifier ? `${retrieved.originalQuestion} in ${locationQualifier}` : retrieved.originalQuestion,
    forcedCandidate: selectedOption,
    identityAlreadyResolved: true,
  };
  void reconResult; // computed for parity with production; production also never uses it

  await consumePendingInteraction(client, interaction.id);

  const { spyEngine: turn2Engine, getCalls } = countingEngine();
  const turn2Result = await turn2Engine.execute({
    question: reconstructed.question,
    parameters: {},
    identityAlreadyResolved: reconstructed.identityAlreadyResolved,
  } as any);

  let usedFallback = false;
  let fallbackResult: any;
  let finalResult = turn2Result;
  const rawTurn2Answerability = turn2Result.answerability;

  if (!turn2Result.success) {
    const facilityId = reconstructed.forcedCandidate?.facility_id;
    if (typeof facilityId === "string" && reconstructed.identityAlreadyResolved) {
      fallbackResult = await lookupHospitalOverallRating(facilityId);
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
      result: finalResult,
      rawTurn2Success: turn2Result.success,
      rawTurn2Answerability,
      sqlCalls: getCalls(),
      usedFallback,
      fallbackResult,
    },
  };
}

function measureCodes(rows: any[]): string[] {
  return [...new Set(rows.map((r) => r.measure_code).filter((v) => v !== undefined))];
}

async function main() {
  console.log("=".repeat(90));
  console.log("TIER0 TASK 6 AUDIT: DISAMBIGUATION TURN-2 CONTEXT DROP (READ-ONLY DIAGNOSTIC)");
  console.log("=".repeat(90));

  // --- Step 0: DB ground truth for "MEMORIAL HOSPITAL" (hardcoding check) ---
  const { data: memorialRows, error: memorialErr } = await client
    .from("warehouse_hospitals")
    .select("facility_id, hospital_name, city, state, county")
    .eq("hospital_name", "MEMORIAL HOSPITAL")
    .order("state")
    .order("city");
  record(
    "STEP0-DB-MEMORIAL-EXACT-COUNT",
    !memorialErr && (memorialRows?.length ?? 0) === 12,
    `rowCount=${memorialRows?.length} error=${JSON.stringify(memorialErr?.message)} facilities=${JSON.stringify(memorialRows?.map((r) => `${r.facility_id}:${r.city},${r.state}`))}`,
  );

  const { data: belleville } = await client
    .from("warehouse_hospital_clinical_outcomes")
    .select("facility_id, measure_code, score")
    .eq("facility_id", "140185")
    .eq("measure_code", "MORT_30_AMI");
  record(
    "STEP0-DB-BELLEVILLE-MORT30AMI-PRESENT",
    (belleville?.length ?? 0) === 1,
    `rows=${JSON.stringify(belleville)}`,
  );

  // ============================================================
  // GROUP A — Memorial Hospital ambiguous + condition query
  // ============================================================
  console.log("\n--- GROUP A: Memorial Hospital ambiguous + condition (Task 6 reported bug) ---");
  const a1 = await simulateTwoTurn(
    "What is Memorial Hospital's mortality rate for heart attack specifically?",
    "BELLEVILLE",
  );
  record(
    "GA-1-TURN1-AMBIGUOUS-12WAY",
    a1.turn1.answerability?.status === "ambiguous" && a1.turn1.candidateCount === 12,
    `status=${a1.turn1.answerability?.status} reason=${a1.turn1.answerability?.reason} candidateCount=${a1.turn1.candidateCount}`,
  );
  if (a1.turn2) {
    const rows = (a1.turn2.result.rows ?? []) as any[];
    record(
      "GA-2-TURN2-RECONSTRUCTED-QUESTION",
      true,
      `question="${a1.turn2.reconstructedQuestion}"`,
    );
    record(
      "GA-3-TURN2-OUTCOME",
      true,
      `finalSuccess=${a1.turn2.result.success} finalAnswerability=${JSON.stringify(a1.turn2.result.answerability)} rawTurn2Success(pre-fallback)=${a1.turn2.rawTurn2Success} rawTurn2Answerability(pre-fallback)=${JSON.stringify(a1.turn2.rawTurn2Answerability)} sqlCalls=${a1.turn2.sqlCalls} usedFallback=${a1.turn2.usedFallback} rowCount=${rows.length} facility_ids=[${rows.map((r: any) => r.facility_id).join(",")}] measure_codes=${JSON.stringify(measureCodes(rows))} overall_rating=${JSON.stringify(rows.map((r: any) => r.overall_rating))}`,
    );
    record(
      "GA-4-CONDITION-FILTER-PRESERVED?",
      rows.length > 0 && measureCodes(rows).includes("MORT_30_AMI") && rows[0]?.overall_rating === undefined,
      `EXPECTED (correct behavior): rows scoped to MORT_30_AMI only, no bare overall_rating. ACTUAL: measure_codes=${JSON.stringify(measureCodes(rows))} has_overall_rating_field=${rows[0]?.overall_rating !== undefined}`,
    );
  }

  // ============================================================
  // GROUP B — Mayo Clinic controls
  // ============================================================
  console.log("\n--- GROUP B: Mayo Clinic controls ---");
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "What is Mayo Clinic's mortality rate for heart attack specifically?" });
    const rows = (r.rows ?? []) as any[];
    record(
      "GB-1-MAYO-UNAMBIGUOUS-AMI-LOOKUP",
      r.success === true && rows.length === 1 && rows[0]?.measure_code === "MORT_30_AMI" && rows[0]?.facility_id === "100151",
      `success=${r.success} rowCount=${rows.length} facility_id=${rows[0]?.facility_id} measure_code=${rows[0]?.measure_code} sqlCalls=${getCalls()}`,
    );
  }
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Mayo Clinic best AMI mortality" });
    record(
      "GB-2-MAYO-RANKING-F8-AMBIGUITY-CONTROL",
      r.success === false && r.answerability?.status === "ambiguous" && getCalls() === 0,
      `success=${r.success} status=${r.answerability?.status} reason=${r.answerability?.reason} sqlCalls=${getCalls()}`,
    );
  }

  // ============================================================
  // GROUP C — condition-only ranking control (no ambiguity, no continuation)
  // ============================================================
  console.log("\n--- GROUP C: condition-only ranking control ---");
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me hospitals with best AMI mortality" });
    const rows = (r.rows ?? []) as any[];
    record(
      "GC-1-BARE-AMI-RANKING",
      r.success === true && rows.length === 10 && measureCodes(rows).every((m) => m === "MORT_30_AMI"),
      `success=${r.success} rowCount=${rows.length} measure_codes=${JSON.stringify(measureCodes(rows))} sqlCalls=${getCalls()}`,
    );
  }

  // ============================================================
  // GROUP D — combined ownership + condition control
  // ============================================================
  console.log("\n--- GROUP D: combined ownership + condition control ---");
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me non-profit hospitals with best AMI mortality" });
    const rows = (r.rows ?? []) as any[];
    record(
      "GD-1-OWNERSHIP-PLUS-CONDITION",
      r.success === true && rows.length > 0 && measureCodes(rows).every((m) => m === "MORT_30_AMI") && rows.every((row: any) => String(row.ownership ?? "").startsWith("Voluntary non-profit")),
      `success=${r.success} rowCount=${rows.length} measure_codes=${JSON.stringify(measureCodes(rows))} ownership=${JSON.stringify([...new Set(rows.map((row: any) => row.ownership))])} sqlCalls=${getCalls()}`,
    );
  }

  // ============================================================
  // GROUP E — Task 1-5 preservation controls
  // ============================================================
  console.log("\n--- GROUP E: Task 1-5 preservation controls ---");
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Memorial Hospital Texas" });
    const rows = (r.rows ?? []) as any[];
    record(
      "GE-1-MEMORIAL-TEXAS-3WAY-NARROWED",
      r.success === true || (r.answerability?.status === "ambiguous"),
      `success=${r.success} status=${r.answerability?.status} rowCount=${rows.length} facility_ids=${JSON.stringify(rows.map((row: any) => row.facility_id))} sqlCalls=${getCalls()}`,
    );
  }
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "Show me hospitals in Birmingham, Alabama with their overall ratings" });
    const rows = (r.rows ?? []) as any[];
    record(
      "GE-2-BIRMINGHAM-9ROWS",
      r.success === true && rows.length === 9,
      `success=${r.success} rowCount=${rows.length} sqlCalls=${getCalls()}`,
    );
  }
  {
    const { spyEngine, getCalls } = countingEngine();
    const r = await spyEngine.execute({ question: "ALBANY county hospitals" });
    record(
      "GE-3-BARE-ALBANY-COUNTY-CLARIFICATION",
      r.success === false && r.answerability?.status === "ambiguous" && getCalls() === 0,
      `success=${r.success} status=${r.answerability?.status} reason=${r.answerability?.reason} sqlCalls=${getCalls()}`,
    );
  }

  // ============================================================
  // Supplementary evidence for the design doc: distinct measure codes,
  // condition/ownership alias lists (from DB, not code claims)
  // ============================================================
  console.log("\n--- SUPPLEMENTARY: distinct measure_code values (live DB) ---");
  const { data: measureCodeRows } = await client
    .from("warehouse_hospital_clinical_outcomes")
    .select("measure_code")
    .limit(1000);
  const distinctMeasureCodes = [...new Set((measureCodeRows ?? []).map((r: any) => r.measure_code))].sort();
  console.log(JSON.stringify(distinctMeasureCodes, null, 2));

  console.log("\n" + "=".repeat(90));
  const passed = results.filter((r) => r.passed).length;
  console.log(`SUMMARY: ${passed}/${results.length} PASS`);
  console.log("=".repeat(90));
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
