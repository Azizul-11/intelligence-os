/**
 * Phase 7.5.8 - Complete Explicit Entity Comparison Proof
 *
 * Proves that IntelligenceOS can produce a COMPLETE deterministic
 * comparison dataset for explicitly named entities across multiple
 * currently-supported deterministic metrics, aligned by canonical
 * identity - not just the single-metric two/three-entity proofs from
 * 7.5.5/7.5.6.
 *
 * This composes two independently-built, unmodified capabilities:
 *   - Phase 7.5.3/7.5.5/7.5.6: explicit multi-entity identity sets,
 *     routed to the "-by-facility-ids" template.
 *   - Phase 6/7: multi-metric ExecutionPlan.metrics[] with the
 *     secondary-metric fetch-and-align loop in create-runtime-engine.ts.
 *
 * No production code was changed for this phase - both mechanisms
 * already compose correctly, confirmed live below.
 *
 * IMPORTANT: this does NOT prove or implement metric-less "Compare A vs
 * B" (automatic metric discovery). Every query below names its metrics
 * explicitly, exactly like every prior phase's proof - the future
 * capability of inferring applicable metrics with no metric named
 * remains out of scope (see the Phase 7.5.8 report's compatibility
 * assessment for why the architecture does not block it later).
 *
 * Real entities (inspected from actual CMS data in prior phases, not
 * invented): Mayo Clinic (100151), Cleveland Clinic (360180), Duke
 * University Hospital (340030). "Greene County Hospital" is reused from
 * the 7.5.2 proof as a genuinely ambiguous real duplicate name (2
 * distinct facilities) to exercise identity-preservation under
 * ambiguity.
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

const MAYO_CLINIC = "100151";
const CLEVELAND_CLINIC = "360180";
const DUKE_UNIVERSITY_HOSPITAL = "340030";

function rowById(rows: Record<string, unknown>[], id: string): Record<string, unknown> | undefined {
  return rows.find((row) => row.facility_id === id);
}

async function main() {
  // ===== TEST 1: two-entity complete comparison (3 metrics) =====
  {
    const query = "Compare Mayo Clinic and Cleveland Clinic on overall rating, mortality, and readmission";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = (result.rows ?? []) as Record<string, unknown>[];

    const mayo = rowById(rows, MAYO_CLINIC);
    const cleveland = rowById(rows, CLEVELAND_CLINIC);

    const pass =
      result.success === true &&
      rows.length === 2 &&
      mayo !== undefined &&
      cleveland !== undefined &&
      typeof mayo.overall_rating === "string" &&
      typeof mayo.facility_mort_measure_count === "number" &&
      typeof mayo.facility_readm_measure_count === "number" &&
      typeof cleveland.overall_rating === "string" &&
      typeof cleveland.facility_mort_measure_count === "number" &&
      typeof cleveland.facility_readm_measure_count === "number";

    check(
      "TEST 1 - TWO-ENTITY COMPLETE COMPARISON",
      `"${query}" returns both entities, each carrying all three requested deterministic metrics`,
      pass,
      `success=${result.success}, rowCount=${rows.length}, rows=${JSON.stringify(rows)}`,
    );
  }

  // ===== TEST 2: three-entity complete comparison (3 metrics), no
  // N=3 special case - same code path as TEST 1. =====
  {
    const query =
      "Compare Mayo Clinic, Cleveland Clinic, and Duke University Hospital on overall rating, mortality, and readmission";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = (result.rows ?? []) as Record<string, unknown>[];

    const returnedIds = rows.map((r) => r.facility_id as string).sort();
    const expectedIds = [MAYO_CLINIC, CLEVELAND_CLINIC, DUKE_UNIVERSITY_HOSPITAL].sort();

    const allHaveAllMetrics = rows.every(
      (row) =>
        typeof row.overall_rating === "string" &&
        typeof row.facility_mort_measure_count === "number" &&
        typeof row.facility_readm_measure_count === "number",
    );

    const pass =
      result.success === true &&
      rows.length === 3 &&
      JSON.stringify(returnedIds) === JSON.stringify(expectedIds) &&
      allHaveAllMetrics;

    check(
      "TEST 2 - THREE-ENTITY COMPLETE COMPARISON",
      `"${query}" returns exactly the three requested entities, each with all three metrics - same mechanism as TEST 1, no N=3 special case`,
      pass,
      `success=${result.success}, returnedIds=${JSON.stringify(returnedIds)}, rows=${JSON.stringify(rows)}`,
    );
  }

  // ===== TEST 3: reverse mention order does not corrupt identity =====
  {
    const forward = "Compare Mayo Clinic and Cleveland Clinic on overall rating, mortality, and readmission";
    const reverse = "Compare Cleveland Clinic and Mayo Clinic on overall rating, mortality, and readmission";

    const forwardResult = await engine.execute({ question: forward, parameters: {} });
    const reverseResult = await engine.execute({ question: reverse, parameters: {} });

    const forwardRows = (forwardResult.rows ?? []) as Record<string, unknown>[];
    const reverseRows = (reverseResult.rows ?? []) as Record<string, unknown>[];

    const forwardMayo = rowById(forwardRows, MAYO_CLINIC);
    const reverseMayo = rowById(reverseRows, MAYO_CLINIC);
    const forwardCleveland = rowById(forwardRows, CLEVELAND_CLINIC);
    const reverseCleveland = rowById(reverseRows, CLEVELAND_CLINIC);

    const pass =
      forwardResult.success === true &&
      reverseResult.success === true &&
      JSON.stringify(forwardMayo) === JSON.stringify(reverseMayo) &&
      JSON.stringify(forwardCleveland) === JSON.stringify(reverseCleveland);

    check(
      "TEST 3 - REVERSE ENTITY ORDER",
      "Mentioning the two entities in the opposite order produces identical per-identity results - metric values stay bound to canonical facility_id, never to mention position or row position",
      pass,
      `forwardMayo=${JSON.stringify(forwardMayo)}, reverseMayo=${JSON.stringify(reverseMayo)}, forwardCleveland=${JSON.stringify(forwardCleveland)}, reverseCleveland=${JSON.stringify(reverseCleveland)}`,
    );
  }

  // ===== TEST 4: existing single-metric ranking regression =====
  {
    const query = "highest rated hospitals";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = (result.rows ?? []) as Record<string, unknown>[];

    const pass = result.success === true && rows.length > 0 && typeof rows[0]?.overall_rating === "string";

    check(
      "TEST 4 - EXISTING SINGLE-METRIC REGRESSION",
      `"${query}" still works unchanged`,
      pass,
      `success=${result.success}, rowCount=${rows.length}`,
    );
  }

  // ===== TEST 5: existing multi-metric (no explicit entities) regression =====
  {
    const query = "Which hospitals have the best overall rating and lowest mortality?";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = (result.rows ?? []) as Record<string, unknown>[];

    const pass =
      result.success === true &&
      rows.length > 0 &&
      typeof rows[0]?.overall_rating === "string" &&
      typeof rows[0]?.facility_mort_measure_count === "number";

    check(
      "TEST 5 - EXISTING MULTI-METRIC REGRESSION",
      `"${query}" (Phase 6/7 multi-metric ranking, no explicit entities) still works unchanged`,
      pass,
      `success=${result.success}, rowCount=${rows.length}, sample=${JSON.stringify(rows[0])}`,
    );
  }

  // ===== TEST 6: filter + entity comparison does not corrupt identity =====
  {
    const query = "Compare Mayo Clinic and Cleveland Clinic in Florida on overall rating and mortality";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = (result.rows ?? []) as Record<string, unknown>[];

    const returnedIds = rows.map((r) => r.facility_id as string).sort();
    const expectedIds = [MAYO_CLINIC, CLEVELAND_CLINIC].sort();

    const pass = result.success === true && JSON.stringify(returnedIds) === JSON.stringify(expectedIds);

    check(
      "TEST 6 - FILTER + ENTITY COMPARISON",
      `An incidental additional filter ("in Florida") alongside an explicit entity comparison does not drop, merge, or corrupt either requested entity`,
      pass,
      `success=${result.success}, returnedIds=${JSON.stringify(returnedIds)}, rows=${JSON.stringify(rows)}`,
    );
  }

  // ===== TEST 7: duplicate display name / ambiguity is preserved, not
  // silently resolved - even inside a multi-entity comparison request. =====
  {
    // "Greene County Hospital" is a real, genuinely ambiguous name in
    // the CMS dataset (2 distinct facility_ids), already proven
    // ambiguous in the 7.5.2 proof. It must never be silently resolved
    // to either candidate ID; it must simply not participate, while the
    // other two, unambiguous, explicitly named entities still complete
    // a full comparison on their correct canonical IDs.
    const query = "Compare Greene County Hospital, Mayo Clinic, and Cleveland Clinic on overall rating";
    const result = await engine.execute({ question: query, parameters: {} });
    const rows = (result.rows ?? []) as Record<string, unknown>[];

    const returnedIds = rows.map((r) => r.facility_id as string).sort();
    const expectedIds = [MAYO_CLINIC, CLEVELAND_CLINIC].sort();

    const noAmbiguousFacilityLeaked =
      !returnedIds.includes("010051") && !returnedIds.includes("250782"); // Greene County Hospital's two real candidate IDs (confirmed live via HealthcareEntityProvider.resolve())

    const pass =
      result.success === true &&
      JSON.stringify(returnedIds) === JSON.stringify(expectedIds) &&
      noAmbiguousFacilityLeaked;

    check(
      "TEST 7 - DUPLICATE DISPLAY NAME / AMBIGUITY PRESERVED",
      'A genuinely ambiguous duplicate name ("Greene County Hospital", 2 real candidate facilities) present alongside two unambiguous explicit entities is excluded - never silently resolved to either candidate ID - while Mayo Clinic and Cleveland Clinic still complete correctly on their true canonical IDs',
      pass,
      `success=${result.success}, returnedIds=${JSON.stringify(returnedIds)}`,
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("PHASE 7.5.8 COMPLETE EXPLICIT ENTITY COMPARISON PROOF");
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
    console.log("\n❌ PHASE 7.5.8 COMPLETE EXPLICIT ENTITY COMPARISON PROOF: FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ PHASE 7.5.8 COMPLETE EXPLICIT ENTITY COMPARISON PROOF: ALL TESTS PASSED");
  }
}

main();
