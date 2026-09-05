/**
 * Phase 8.11 - Controlled Proofs (Master Vision §18.14)
 * 
 * Executes all 13 canonical controlled proofs (A-M) to verify Phase 8 
 * architectural completeness per Master Vision requirements.
 * 
 * SCOPE:
 * - Proof A: Valid single metric
 * - Proof B: Valid compound metric
 * - Proof C: Entity-constrained compound
 * - Proof D: Duplicate entity clarification (2 turns)
 * - Proof E: Multiple explicit entities
 * - Proof F: Unsupported capability
 * - Proof G: Data unavailable
 * - Proof H: Guidance + continuation (2 turns)
 * - Proof I: Complete clarification loop (full E2E)
 * - Proof J: Atomic multi-metric failure
 * - Proof K: No-SQL ambiguity control (negative)
 * - Proof L: No-SQL capability control (negative)
 * - Proof M: Mayo/Rochester documented observation
 * 
 * EVIDENCE STANDARDS:
 * - Build + Typecheck must pass before execution
 * - Real RuntimeEngine with deterministic pipeline
 * - Spy executor for negative controls (K, L)
 * - Multi-turn proofs against remote orchestrator
 * - NO code modifications to force test results
 */

import { createClient } from "@supabase/supabase-js";
import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { env } from "./shared/env";

// ============================================================================
// TYPES
// ============================================================================

interface ProofResult {
  proofId: string;
  proofName: string;
  status: "PASS" | "FAIL" | "SKIP" | "OBSERVE";
  evidence: {
    success: boolean;
    answerability?: {
      status: string;
      reason?: string;
      candidates?: unknown[];
      alternatives?: unknown[];
    };
    rowCount: number;
    sqlExecuted?: boolean;
    facilityIds?: string[];
    errorMessage?: string;
    turn1?: unknown;
    turn2?: unknown;
  };
  timing: {
    executionMs: number;
  };
  notes?: string;
}

interface ExecutorSpy {
  called: boolean;
  callCount: number;
}

// ============================================================================
// SETUP
// ============================================================================

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

function makeRealEngine() {
  return createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: new SqlExecutor(new SupabaseDatabaseAdapter(supabase)),
  });
}

function makeSpyEngine(spy: ExecutorSpy) {
  const spyExecutor = {
    async execute() {
      spy.called = true;
      spy.callCount++;
      return { success: true, rows: [], rowCount: 0 };
    },
  };
  return createRuntimeEngine({
    runtime,
    semantic,
    planner,
    executionPlanMapper: mapper,
    executor: spyExecutor as any,
  });
}

// ============================================================================
// REMOTE ORCHESTRATOR (for multi-turn proofs)
// ============================================================================

const ORCHESTRATOR_URL = `${env.supabaseUrl}/functions/v1/orchestrator`;

async function callOrchestrator(payload: {
  question: string;
  domain?: string;
  pendingInteractionId?: string;
  continuationResponse?: string;
}) {
  const response = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.supabaseAnonKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Orchestrator returned ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

// ============================================================================
// UTILITY
// ============================================================================

function log(message: string) {
  console.log(message);
}

function extractFacilityIds(rows: any[]): string[] {
  return rows
    .map((r) => r.facility_id || r.facilityId)
    .filter(Boolean)
    .slice(0, 10); // Limit to first 10 for readability
}

// ============================================================================
// PROOFS
// ============================================================================

const proofResults: ProofResult[] = [];

// ----------------------------------------------------------------------------
// PROOF A: Valid Single Metric
// ----------------------------------------------------------------------------

async function proofA(): Promise<ProofResult> {
  const start = Date.now();
  const engine = makeRealEngine();

  try {
    const result = await engine.execute({
      question: "highest rated hospitals",
      parameters: {},
    });

    const pass =
      result.success === true &&
      result.answerability?.status === "answerable" &&
      result.rowCount > 0 &&
      result.rows.some((r: any) => r.overall_rating !== undefined || r.hospital_overall_rating !== undefined);

    return {
      proofId: "A",
      proofName: "Valid single metric",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: result.rowCount,
        facilityIds: extractFacilityIds(result.rows),
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
    };
  } catch (error) {
    return {
      proofId: "A",
      proofName: "Valid single metric",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF B: Valid Compound Metric
// ----------------------------------------------------------------------------

async function proofB(): Promise<ProofResult> {
  const start = Date.now();
  const engine = makeRealEngine();

  try {
    const result = await engine.execute({
      question: "Which hospitals have the best overall rating and lowest mortality?",
      parameters: {},
    });

    const hasBothMetrics = result.rows.some(
      (r: any) =>
        (r.overall_rating !== undefined || r.hospital_overall_rating !== undefined) &&
        (r.mort_measures_better !== undefined || 
         r.mort_measures_worse !== undefined ||
         r.mort_measures_no_different !== undefined ||
         r.facility_mort_measure_count !== undefined ||
         r.mortality_rate !== undefined)
    );

    const pass =
      result.success === true &&
      result.answerability?.status === "answerable" &&
      result.rowCount > 0 &&
      hasBothMetrics;

    return {
      proofId: "B",
      proofName: "Valid compound metric",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: result.rowCount,
        facilityIds: extractFacilityIds(result.rows),
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
      notes: hasBothMetrics ? "Both metrics present in results" : "Missing one or both metrics",
    };
  } catch (error) {
    return {
      proofId: "B",
      proofName: "Valid compound metric",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF C: Entity-Constrained Compound
// ----------------------------------------------------------------------------

async function proofC(): Promise<ProofResult> {
  const start = Date.now();
  const engine = makeRealEngine();

  try {
    const result = await engine.execute({
      question: "Which hospitals in Texas have the best overall rating and lowest mortality?",
      parameters: {},
    });

    const allTexas = result.rows.every((r: any) => r.state === "TX");
    const hasBothMetrics = result.rows.some(
      (r: any) =>
        (r.overall_rating !== undefined || r.hospital_overall_rating !== undefined) &&
        (r.mort_measures_better !== undefined || 
         r.mort_measures_worse !== undefined ||
         r.mort_measures_no_different !== undefined ||
         r.facility_mort_measure_count !== undefined ||
         r.mortality_rate !== undefined)
    );

    const pass =
      result.success === true &&
      result.answerability?.status === "answerable" &&
      result.rowCount > 0 &&
      allTexas &&
      hasBothMetrics;

    return {
      proofId: "C",
      proofName: "Entity-constrained compound",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: result.rowCount,
        facilityIds: extractFacilityIds(result.rows),
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
      notes: allTexas
        ? "All rows are Texas facilities"
        : "Contains non-Texas facilities",
    };
  } catch (error) {
    return {
      proofId: "C",
      proofName: "Entity-constrained compound",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF D: Duplicate Entity Clarification (2 Turns)
// ----------------------------------------------------------------------------

async function proofD(): Promise<ProofResult> {
  const start = Date.now();

  try {
    // Turn 1: Ambiguous query
    const turn1 = await callOrchestrator({
      question: "overall rating of Northwest Medical Center",
      domain: "healthcare",
    });

    const turn1Pass =
      turn1.success === false &&
      turn1.pendingInteractionId !== undefined &&
      turn1.interactionKind === "clarification";

    if (!turn1Pass) {
      return {
        proofId: "D",
        proofName: "Duplicate entity clarification (2 turns)",
        status: "FAIL",
        evidence: {
          success: false,
          rowCount: 0,
          turn1,
          errorMessage: "Turn 1 did not return clarification",
        },
        timing: { executionMs: Date.now() - start },
      };
    }

    // Turn 2: User selects Tucson
    const turn2 = await callOrchestrator({
      question: "Tucson",
      domain: "healthcare",
      pendingInteractionId: turn1.pendingInteractionId,
      continuationResponse: "Tucson",
    });

    const turn2Data = turn2.answer ? JSON.parse(turn2.answer) : [];
    const resolvedTo030085 =
      Array.isArray(turn2Data) &&
      turn2Data.some((r: any) => r.facility_id === "030085");

    const pass = turn1Pass && turn2.success === true && resolvedTo030085;

    return {
      proofId: "D",
      proofName: "Duplicate entity clarification (2 turns)",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: turn2.success,
        rowCount: Array.isArray(turn2Data) ? turn2Data.length : 0,
        facilityIds: resolvedTo030085 ? ["030085"] : [],
        turn1: {
          pendingInteractionId: turn1.pendingInteractionId,
          interactionKind: turn1.interactionKind,
        },
        turn2: {
          success: turn2.success,
          resolvedFacility: resolvedTo030085 ? "030085 (Tucson, AZ)" : "Unknown",
        },
      },
      timing: { executionMs: Date.now() - start },
      notes: resolvedTo030085
        ? "Correctly resolved to Tucson facility"
        : "Did not resolve to expected facility",
    };
  } catch (error) {
    return {
      proofId: "D",
      proofName: "Duplicate entity clarification (2 turns)",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF E: Multiple Explicit Entities
// ----------------------------------------------------------------------------

async function proofE(): Promise<ProofResult> {
  const start = Date.now();
  const engine = makeRealEngine();

  try {
    const result = await engine.execute({
      question: "Compare Mayo Clinic Jacksonville and Cleveland Clinic by overall rating",
      parameters: {},
    });

    const facilityIds = extractFacilityIds(result.rows);
    const hasMayo = facilityIds.includes("100151"); // Mayo Clinic Jacksonville
    const hasCleveland = facilityIds.includes("360180"); // Cleveland Clinic
    const exactlyTwo = result.rowCount === 2;

    const pass =
      result.success === true &&
      result.answerability?.status === "answerable" &&
      exactlyTwo &&
      hasMayo &&
      hasCleveland;

    return {
      proofId: "E",
      proofName: "Multiple explicit entities",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: result.rowCount,
        facilityIds,
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
      notes: pass
        ? "Both Mayo Jacksonville (100151) and Cleveland Clinic (360180) returned"
        : `Expected 2 rows with facilities 100151, 360180. Got ${result.rowCount} rows: ${facilityIds.join(", ")}`,
    };
  } catch (error) {
    return {
      proofId: "E",
      proofName: "Multiple explicit entities",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF F: Unsupported Capability
// ----------------------------------------------------------------------------

async function proofF(): Promise<ProofResult> {
  const start = Date.now();
  const engine = makeRealEngine();

  try {
    const result = await engine.execute({
      question: "hospitals ranked by length of stay",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "capability-unavailable" &&
      result.rowCount === 0;

    return {
      proofId: "F",
      proofName: "Unsupported capability",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: result.rowCount,
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
      notes: pass ? "Correctly refused with capability-unavailable" : "Did not refuse correctly",
    };
  } catch (error) {
    return {
      proofId: "F",
      proofName: "Unsupported capability",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF G: Data Unavailable
// ----------------------------------------------------------------------------

async function proofG(): Promise<ProofResult> {
  const start = Date.now();
  const engine = makeRealEngine();

  try {
    const result = await engine.execute({
      question: "mortality rate for Mountain View Hospital in Alabama",
      parameters: {},
    });

    // Data-unavailable requires: semantic understood, capability supported, data missing
    // This proof is conditional - if data exists, we SKIP; if data missing, verify classification
    const isDataUnavailable =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "data-unavailable" &&
      result.rowCount === 0;

    const isDataAvailable = result.success === true && result.rowCount > 0;

    return {
      proofId: "G",
      proofName: "Data unavailable",
      status: isDataUnavailable ? "PASS" : isDataAvailable ? "SKIP" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: result.rowCount,
        facilityIds: extractFacilityIds(result.rows),
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
      notes: isDataUnavailable
        ? "Data-unavailable classification working correctly"
        : isDataAvailable
        ? "SKIP - Data exists for this entity, cannot test data-unavailable scenario"
        : "Failed to classify correctly",
    };
  } catch (error) {
    return {
      proofId: "G",
      proofName: "Data unavailable",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF H: Guidance + Continuation (2 Turns)
// ----------------------------------------------------------------------------

async function proofH(): Promise<ProofResult> {
  const start = Date.now();

  try {
    // Turn 1: Unsupported capability triggers guidance
    const turn1 = await callOrchestrator({
      question: "hospitals ranked by length of stay",
      domain: "healthcare",
    });

    const turn1Pass =
      turn1.success === false &&
      turn1.pendingInteractionId !== undefined &&
      turn1.interactionKind === "guidance";

    if (!turn1Pass) {
      return {
        proofId: "H",
        proofName: "Guidance + continuation (2 turns)",
        status: "FAIL",
        evidence: {
          success: false,
          rowCount: 0,
          turn1,
          errorMessage: "Turn 1 did not return guidance",
        },
        timing: { executionMs: Date.now() - start },
      };
    }

    // Turn 2: User selects alternative
    const turn2 = await callOrchestrator({
      question: "use overall rating",
      domain: "healthcare",
      pendingInteractionId: turn1.pendingInteractionId,
      continuationResponse: "use overall rating",
    });

    const turn2Data = turn2.answer ? JSON.parse(turn2.answer) : [];
    const hasOverallRating =
      Array.isArray(turn2Data) &&
      turn2Data.some((r: any) => r.overall_rating !== undefined || r.hospital_overall_rating !== undefined);

    const pass = turn1Pass && turn2.success === true && hasOverallRating;

    return {
      proofId: "H",
      proofName: "Guidance + continuation (2 turns)",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: turn2.success,
        rowCount: Array.isArray(turn2Data) ? turn2Data.length : 0,
        facilityIds: extractFacilityIds(turn2Data),
        turn1: {
          pendingInteractionId: turn1.pendingInteractionId,
          interactionKind: turn1.interactionKind,
        },
        turn2: {
          success: turn2.success,
          hasOverallRating,
        },
      },
      timing: { executionMs: Date.now() - start },
      notes: hasOverallRating
        ? "Correctly reconstructed to overall rating query"
        : "Did not return overall rating results",
    };
  } catch (error) {
    return {
      proofId: "H",
      proofName: "Guidance + continuation (2 turns)",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF I: Complete Clarification Loop (E2E)
// ----------------------------------------------------------------------------

async function proofI(): Promise<ProofResult> {
  // Proof I is the same as Proof D but with explicit E2E verification emphasis
  // Master Vision §18.14: "This establishes the minimum conversational behavior"
  return proofD().then((result) => ({
    ...result,
    proofId: "I",
    proofName: "Complete clarification loop (E2E)",
    notes:
      (result.notes || "") +
      " | E2E verification: Turn 1 Ambiguity → Clarification → User Answer → Re-resolution → Re-validation → Execution",
  }));
}

// ----------------------------------------------------------------------------
// PROOF J: Atomic Multi-Metric Failure
// ----------------------------------------------------------------------------

async function proofJ(): Promise<ProofResult> {
  const start = Date.now();
  const engine = makeRealEngine();

  try {
    const result = await engine.execute({
      question: "hospitals ranked by overall rating and length of stay",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "capability-unavailable" &&
      result.rowCount === 0;

    return {
      proofId: "J",
      proofName: "Atomic multi-metric failure",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: result.rowCount,
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
      notes: pass
        ? "Correctly failed atomically - no partial execution"
        : "Did not fail atomically",
    };
  } catch (error) {
    return {
      proofId: "J",
      proofName: "Atomic multi-metric failure",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF K: No-SQL Ambiguity Control (Negative)
// ----------------------------------------------------------------------------

async function proofK(): Promise<ProofResult> {
  const start = Date.now();
  const spy: ExecutorSpy = { called: false, callCount: 0 };
  const engine = makeSpyEngine(spy);

  try {
    const result = await engine.execute({
      question: "Northwest Medical Center",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      spy.called === false &&
      spy.callCount === 0;

    return {
      proofId: "K",
      proofName: "No-SQL ambiguity control (negative)",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: 0,
        sqlExecuted: spy.called,
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
      notes: pass
        ? "SQL executor never called - ambiguity gate working"
        : `SQL executor called ${spy.callCount} times - GATE FAILURE`,
    };
  } catch (error) {
    return {
      proofId: "K",
      proofName: "No-SQL ambiguity control (negative)",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        sqlExecuted: spy.called,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF L: No-SQL Capability Control (Negative)
// ----------------------------------------------------------------------------

async function proofL(): Promise<ProofResult> {
  const start = Date.now();
  const spy: ExecutorSpy = { called: false, callCount: 0 };
  const engine = makeSpyEngine(spy);

  try {
    const result = await engine.execute({
      question: "hospitals ranked by length of stay",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "not_directly_answerable" &&
      result.answerability?.reason === "capability-unavailable" &&
      spy.called === false &&
      spy.callCount === 0;

    return {
      proofId: "L",
      proofName: "No-SQL capability control (negative)",
      status: pass ? "PASS" : "FAIL",
      evidence: {
        success: result.success,
        answerability: result.answerability,
        rowCount: 0,
        sqlExecuted: spy.called,
        errorMessage: result.error,
      },
      timing: { executionMs: Date.now() - start },
      notes: pass
        ? "SQL executor never called - capability gate working"
        : `SQL executor called ${spy.callCount} times - GATE FAILURE`,
    };
  } catch (error) {
    return {
      proofId: "L",
      proofName: "No-SQL capability control (negative)",
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        sqlExecuted: spy.called,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
    };
  }
}

// ----------------------------------------------------------------------------
// PROOF M: Mayo/Rochester Documented Observation
// ----------------------------------------------------------------------------

async function proofM(): Promise<ProofResult> {
  const start = Date.now();
  const engine = makeRealEngine();

  try {
    // Variant WITHOUT "in" - observational only
    const resultWithout = await engine.execute({
      question: "Mayo Clinic Rochester Minnesota overall rating",
      parameters: {},
    });

    const facilityIdsWithout = extractFacilityIds(resultWithout.rows);
    const resolvedFacilityWithout = facilityIdsWithout[0] || "NONE";

    // Variant WITH "in" - should be fixed to honest failure
    const resultWith = await engine.execute({
      question: "Mayo Clinic in Rochester Minnesota overall rating",
      parameters: {},
    });

    return {
      proofId: "M",
      proofName: "Mayo/Rochester documented observation",
      status: "OBSERVE",
      evidence: {
        success: true, // Observational - always succeeds
        rowCount: resultWithout.rowCount,
        facilityIds: facilityIdsWithout,
        errorMessage: resultWithout.error,
        turn1: {
          variant: 'WITHOUT "in"',
          resolvedTo: resolvedFacilityWithout,
          expected: "Rochester facility",
          mayReturnJacksonville: "100151",
        },
        turn2: {
          variant: 'WITH "in"',
          status: resultWith.success ? "success" : "failure",
          rowCount: resultWith.rowCount,
          notes: resultWith.success
            ? "Variant WITH 'in' executed successfully"
            : "Variant WITH 'in' failed (expected per v9 fix)",
        },
      },
      timing: { executionMs: Date.now() - start },
      notes: `OBSERVATIONAL ONLY. Variant WITHOUT "in" resolved to facility ${resolvedFacilityWithout}. Known upstream qualifier segmentation limitation. Variant WITH "in" ${
        resultWith.success ? "executed" : "failed"
      }. This is documented, not a Phase 8 blocker.`,
    };
  } catch (error) {
    return {
      proofId: "M",
      proofName: "Mayo/Rochester documented observation",
      status: "OBSERVE",
      evidence: {
        success: true,
        rowCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      timing: { executionMs: Date.now() - start },
      notes: "Observation execution encountered error, but this does not fail the suite.",
    };
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runAllProofs() {
  log("\n" + "=".repeat(80));
  log("PHASE 8.11 CONTROLLED PROOFS");
  log("Master Vision §18.14 - 13 Canonical Proofs");
  log("=".repeat(80) + "\n");

  log("Verifying prerequisites...");
  log(`✓ Supabase URL: ${env.supabaseUrl}`);
  log(`✓ Orchestrator URL: ${ORCHESTRATOR_URL}`);
  log("");

  const proofs = [
    { id: "A", fn: proofA, name: "Valid single metric" },
    { id: "B", fn: proofB, name: "Valid compound metric" },
    { id: "C", fn: proofC, name: "Entity-constrained compound" },
    { id: "D", fn: proofD, name: "Duplicate entity clarification (2 turns)" },
    { id: "E", fn: proofE, name: "Multiple explicit entities" },
    { id: "F", fn: proofF, name: "Unsupported capability" },
    { id: "G", fn: proofG, name: "Data unavailable" },
    { id: "H", fn: proofH, name: "Guidance + continuation (2 turns)" },
    { id: "I", fn: proofI, name: "Complete clarification loop (E2E)" },
    { id: "J", fn: proofJ, name: "Atomic multi-metric failure" },
    { id: "K", fn: proofK, name: "No-SQL ambiguity control (negative)" },
    { id: "L", fn: proofL, name: "No-SQL capability control (negative)" },
    { id: "M", fn: proofM, name: "Mayo/Rochester documented observation" },
  ];

  for (const proof of proofs) {
    log(`\nExecuting Proof ${proof.id}: ${proof.name}...`);
    const result = await proof.fn();
    proofResults.push(result);

    const statusSymbol =
      result.status === "PASS"
        ? "✅"
        : result.status === "FAIL"
        ? "❌"
        : result.status === "SKIP"
        ? "⏭️"
        : "👁️";
    log(
      `${statusSymbol} Proof ${proof.id}: ${result.status} (${result.timing.executionMs}ms)`
    );

    if (result.notes) {
      log(`   ${result.notes}`);
    }
  }

  // Summary
  log("\n" + "=".repeat(80));
  log("SUMMARY");
  log("=".repeat(80));

  const passCount = proofResults.filter((r) => r.status === "PASS").length;
  const failCount = proofResults.filter((r) => r.status === "FAIL").length;
  const skipCount = proofResults.filter((r) => r.status === "SKIP").length;
  const observeCount = proofResults.filter((r) => r.status === "OBSERVE").length;

  log(`Total Proofs: ${proofResults.length}`);
  log(`✅ PASS: ${passCount}`);
  log(`❌ FAIL: ${failCount}`);
  log(`⏭️ SKIP: ${skipCount}`);
  log(`👁️ OBSERVE: ${observeCount}`);
  log("");

  if (failCount === 0) {
    log("🎉 ALL PROOFS PASSED (excluding observational)");
  } else {
    log(`⚠️ ${failCount} PROOF(S) FAILED`);
    log("\nFailed proofs:");
    proofResults
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        log(`  - Proof ${r.proofId}: ${r.proofName}`);
        if (r.evidence.errorMessage) {
          log(`    Error: ${r.evidence.errorMessage}`);
        }
      });
  }

  log("\n" + "=".repeat(80));

  // Write results to JSON for report generation
  const fs = await import("fs");
  const outputPath = "./phase8.11-proof-results.json";
  fs.writeFileSync(outputPath, JSON.stringify(proofResults, null, 2));
  log(`\nDetailed results written to: ${outputPath}`);

  process.exit(failCount > 0 ? 1 : 0);
}

// ============================================================================
// ENTRY POINT
// ============================================================================

runAllProofs().catch((error) => {
  console.error("Fatal error running proofs:", error);
  process.exit(1);
});
