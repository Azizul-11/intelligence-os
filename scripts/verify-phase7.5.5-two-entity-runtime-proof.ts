/**
 * Phase 7.5.5 - Two-Entity Runtime Proof
 *
 * Proves a REAL end-to-end explicit two-entity comparison, not isolated
 * parameter construction (that was already covered by 7.5.2-7.5.4):
 *
 *   Natural language -> SemanticResolver -> QueryPlanner ->
 *   ExecutionPlanMapper -> HealthcareExecutionStrategy (template
 *   selection + parameter resolution) -> SqlExecutor ->
 *   SupabaseDatabaseAdapter -> real Postgres warehouse -> two distinct
 *   real rows.
 *
 * Test entities were selected by inspecting the actual generated
 * hospital-identity-directory.ts data (Phase 7.5.2), not invented:
 * "Mayo Clinic" (facility_id 100151, FL) and "Cleveland Clinic"
 * (facility_id 360180, OH) each appear exactly once in the real CMS
 * dataset, so both resolve unambiguously.
 *
 * No mocked runtime, no LLM-generated identity, no LLM-generated SQL,
 * no LLM-generated result - every value below comes from the real
 * warehouse.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { QueryPlanner, ExecutionPlanMapper } from "../packages/query-planner/src/index";
import { SqlExecutor, SupabaseDatabaseAdapter } from "../packages/sql-executor/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import type { RuntimeEngine } from "../packages/runtime-engine/src/runtime-engine";
import type { ExecutionPlan } from "../packages/contracts/src/index";
import { supabase } from "./shared/supabase";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const executionPlanMapper = new ExecutionPlanMapper();
const executor = new SqlExecutor(new SupabaseDatabaseAdapter(supabase));

const engine: RuntimeEngine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor,
});

interface Result {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

const results: Result[] = [];

function check(id: string, description: string, pass: boolean, detail: string) {
  results.push({ id, description, pass, detail });
}

const MAYO_CLINIC_FACILITY_ID = "100151";
const CLEVELAND_CLINIC_FACILITY_ID = "360180";

async function main() {
  // ===== CASE 1: two explicit entities, real end-to-end runtime =====
  const query = "Compare Mayo Clinic and Cleveland Clinic overall rating";
  const result = await engine.execute({ question: query, parameters: {} });
  const rows = (result.rows ?? []) as Record<string, unknown>[];

  {
    const pass =
      result.success === true &&
      result.rowCount === 2 &&
      rows.length === 2 &&
      rows.every((row) => typeof row.overall_rating === "string");

    check(
      "CASE 1 - REAL TWO-ENTITY RUNTIME EXECUTION",
      `"${query}" executes successfully against the real warehouse and returns exactly two rows`,
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, rows=${JSON.stringify(rows)}`,
    );
  }

  // ===== CASE 2: identity integrity =====
  // requested IDs: [Mayo Clinic, Cleveland Clinic] -> returned IDs must
  // be exactly that set - no loss, no overwrite, no duplication, no
  // accidental third entity, and identified by canonical facility_id,
  // never by display name.
  {
    const returnedIds = rows.map((row) => row.facility_id).sort();
    const requestedIds = [MAYO_CLINIC_FACILITY_ID, CLEVELAND_CLINIC_FACILITY_ID].sort();

    const exactMatch = JSON.stringify(returnedIds) === JSON.stringify(requestedIds);
    const noDuplicates = new Set(returnedIds).size === returnedIds.length;
    const noThirdEntity = returnedIds.length === 2;
    const usesCanonicalId = rows.every(
      (row) => row.facility_id === MAYO_CLINIC_FACILITY_ID || row.facility_id === CLEVELAND_CLINIC_FACILITY_ID,
    );

    const pass = exactMatch && noDuplicates && noThirdEntity && usesCanonicalId;

    check(
      "CASE 2 - IDENTITY INTEGRITY",
      "Returned facility_ids are exactly the two requested canonical IDs - no missing, duplicate, or extra entity, identified by ID not display name",
      pass,
      `requestedIds=${JSON.stringify(requestedIds)}, returnedIds=${JSON.stringify(returnedIds)}`,
    );
  }

  // ===== CASE 3: routing precision - the new template-selection branch
  // is scoped to the "hospital" field specifically, not to any "in"
  // filter in general. A synthetic ExecutionPlan whose "in" filter is on
  // an unrelated field ("state") must NOT be routed to a
  // facility-ID-set template - it must fall through to the pre-existing
  // intent-based selection, exactly as before this task. =====
  {
    const strategy = runtime.domain.executionStrategy;

    const syntheticPlan: ExecutionPlan = {
      operation: "compare",
      metric: "hospital-overall-rating",
      filters: [{ field: "state", operator: "in", value: ["TX", "CA"] }],
      parameters: { state: ["TX", "CA"] },
    };

    const templateId = strategy.selectTemplateFromPlan!(syntheticPlan);

    const pass = templateId !== "hospital-overall-rating-by-facility-ids";

    check(
      "CASE 3 - ROUTING PRECISION (unrelated field unaffected)",
      'An "in" filter on "state" (not "hospital") is not misrouted to the facility-ID-set template - the new branch is scoped exactly to explicit hospital identity sets',
      pass,
      `templateId=${templateId}`,
    );
  }

  // ===== CASE 4: single-hospital lookup regression - the pre-existing,
  // non-comparison, single-entity path (Phase 7.5.4's scalar case) is
  // unaffected by this task's routing change. =====
  {
    const singleQuery = "Mayo Clinic overall rating";
    const singleResult = await engine.execute({ question: singleQuery, parameters: {} });
    const singleRows = (singleResult.rows ?? []) as Record<string, unknown>[];

    const pass =
      singleResult.success === true &&
      singleResult.rowCount === 1 &&
      singleRows[0]?.facility_id === MAYO_CLINIC_FACILITY_ID;

    check(
      "CASE 4 - SINGLE-HOSPITAL LOOKUP REGRESSION",
      `"${singleQuery}" still resolves to exactly one row for facility_id ${MAYO_CLINIC_FACILITY_ID}, unaffected by the new comparison routing`,
      pass,
      `success=${singleResult.success}, rowCount=${singleResult.rowCount}, rows=${JSON.stringify(singleRows)}`,
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("PHASE 7.5.5 TWO-ENTITY RUNTIME PROOF VERIFICATION");
  console.log("=".repeat(80));

  for (const r of results) {
    console.log(`\n[${r.id}] ${r.description}`);
    console.log(`  ${r.detail}`);
    console.log(r.pass ? "  ✅ PASS" : "  ❌ FAIL");
  }

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;

  console.log("\n" + "=".repeat(80));
  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log("=".repeat(80));

  if (passed !== total) {
    console.log("\n❌ PHASE 7.5.5 TWO-ENTITY RUNTIME PROOF: FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ PHASE 7.5.5 TWO-ENTITY RUNTIME PROOF: ALL TESTS PASSED");
  }
}

main();
