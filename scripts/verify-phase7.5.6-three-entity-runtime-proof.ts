/**
 * Phase 7.5.6 - Three-Entity Runtime Proof
 *
 * Proves that the explicit entity comparison capability established in
 * Phase 7.5.5 is genuinely N-ary, not a hidden two-entity special case.
 * No production code was changed for this phase - the exact same
 * implementation that handled [A, B] in 7.5.5 is exercised here with
 * [A, B, C], unmodified.
 *
 * Real end-to-end path exercised, no stage bypassed:
 *   Natural language -> SemanticResolver -> QueryPlanner ->
 *   ExecutionPlanMapper -> HealthcareExecutionStrategy (template
 *   selection + parameter resolution) -> SqlExecutor ->
 *   SupabaseDatabaseAdapter -> real Postgres warehouse -> three rows.
 *
 * Test entities were selected by inspecting the actual generated
 * hospital-identity-directory.ts data (Phase 7.5.2), not invented:
 * "Mayo Clinic" (facility_id 100151, FL), "Cleveland Clinic"
 * (facility_id 360180, OH), and "Duke University Hospital" (facility_id
 * 340030, NC) each appear exactly once in the real CMS dataset, so all
 * three resolve unambiguously - and none of the three names contains
 * another entity's name or a state name as a substring, avoiding any
 * incidental overlapping-phrase match.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { QueryPlanner, ExecutionPlanMapper } from "../packages/query-planner/src/index";
import { SqlExecutor, SupabaseDatabaseAdapter } from "../packages/sql-executor/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import type { RuntimeEngine } from "../packages/runtime-engine/src/runtime-engine";
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
const DUKE_UNIVERSITY_HOSPITAL_FACILITY_ID = "340030";

const REQUESTED_IDS = [
  MAYO_CLINIC_FACILITY_ID,
  CLEVELAND_CLINIC_FACILITY_ID,
  DUKE_UNIVERSITY_HOSPITAL_FACILITY_ID,
].sort();

async function main() {
  const query = "Compare Mayo Clinic, Cleveland Clinic, and Duke University Hospital overall rating";

  // ===== Trace every stage explicitly - no stage bypassed =====
  const semanticResult = semantic.resolve(query);
  const entityMatches = semanticResult.matches.filter((m) => m.semanticType === "entity");

  const planResult = planner.createPlan(semanticResult);
  const executionPlan = executionPlanMapper.map(planResult.plan!);
  const hospitalFilter = executionPlan.filters.find((f) => f.field === "hospital");

  const templateId = runtime.domain.executionStrategy.selectTemplateFromPlan!(executionPlan);
  const parameters = runtime.domain.executionStrategy.resolveParametersFromPlan!(executionPlan);

  const result = await engine.execute({ question: query, parameters: {} });
  const rows = (result.rows ?? []) as Record<string, unknown>[];

  // ===== CASE 1: three explicit entities, real end-to-end runtime =====
  {
    const pass = result.success === true && result.rowCount === 3 && rows.length === 3;

    check(
      "CASE 1 - REAL THREE-ENTITY RUNTIME EXECUTION",
      `"${query}" executes successfully against the real warehouse and returns exactly three rows`,
      pass,
      `success=${result.success}, rowCount=${result.rowCount}, rows=${JSON.stringify(rows)}`,
    );
  }

  // ===== CASE 2: identity integrity =====
  // requested IDs: [Mayo Clinic, Cleveland Clinic, Duke University
  // Hospital] -> returned IDs must be exactly that set - no loss, no
  // overwrite, no duplication, no accidental fourth entity, identified
  // by canonical facility_id, never by display name.
  {
    const returnedIds = rows.map((row) => row.facility_id as string).sort();

    const exactMatch = JSON.stringify(returnedIds) === JSON.stringify(REQUESTED_IDS);
    const noDuplicates = new Set(returnedIds).size === returnedIds.length;
    const exactlyThree = returnedIds.length === 3;

    const pass = exactMatch && noDuplicates && exactlyThree;

    check(
      "CASE 2 - IDENTITY INTEGRITY",
      "Returned facility_ids are exactly the three requested canonical IDs - no missing, duplicate, or extra entity, identified by ID not display name",
      pass,
      `requestedIds=${JSON.stringify(REQUESTED_IDS)}, returnedIds=${JSON.stringify(returnedIds)}`,
    );
  }

  // ===== CASE 3: N-ARY PROOF - every stage carries exactly 3, not a
  // hardcoded 2 truncated/padded to 3, and not merely "success" without
  // checking cardinality at each stage. =====
  {
    const entityCount = entityMatches.length;
    const resolvedValues = entityMatches.map((m) => m.resolvedValue).sort();
    const filterValueCount = Array.isArray(hospitalFilter?.value) ? hospitalFilter!.value.length : 0;
    const parameterFacilityIds = parameters.facilityIds;
    const facilityIdsCount = Array.isArray(parameterFacilityIds) ? parameterFacilityIds.length : 0;

    const pass =
      entityCount === 3 &&
      JSON.stringify(resolvedValues) === JSON.stringify(REQUESTED_IDS) &&
      hospitalFilter?.operator === "in" &&
      filterValueCount === 3 &&
      templateId === "hospital-overall-rating-by-facility-ids" &&
      facilityIdsCount === 3 &&
      JSON.stringify([...(parameterFacilityIds as string[])].sort()) === JSON.stringify(REQUESTED_IDS);

    check(
      "CASE 3 - N-ARY PROOF (3 identities survive every stage, unmodified from the 7.5.5 implementation)",
      "3 semantic entity candidates -> 3-value \"in\" filter -> same -by-facility-ids template as 7.5.5 -> 3-value facilityIds parameter -> 3 rows, with no production code path specific to N=2 or N=3",
      pass,
      `entityCount=${entityCount}, resolvedValues=${JSON.stringify(resolvedValues)}, filterValueCount=${filterValueCount}, templateId=${templateId}, facilityIdsCount=${facilityIdsCount}, facilityIds=${JSON.stringify(parameterFacilityIds)}`,
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("PHASE 7.5.6 THREE-ENTITY RUNTIME PROOF VERIFICATION");
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
    console.log("\n❌ PHASE 7.5.6 THREE-ENTITY RUNTIME PROOF: FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ PHASE 7.5.6 THREE-ENTITY RUNTIME PROOF: ALL TESTS PASSED");
  }
}

main();
