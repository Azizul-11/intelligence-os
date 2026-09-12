/**
 * Pre-Phase 9 Tier0 Task 1 - Geographic Value Filtering Verification
 *
 * Verifies county and city scope filtering for ranking/listing queries.
 * Fixes P0 silent-wrong: "ALBANY county" should return 4 facilities, not 52.
 *
 * SCOPE:
 * - Test 1: County filter - ALBANY county → 4 rows NOT 52
 * - Test 2: Dimensional grouping preserved - by county → 52 rows
 * - Test 3: City filter - Birmingham, Alabama → 9 rows NOT 100
 * - Test 4: Bare county resolution - "Best Hospital in ALBANY county" works
 * - Test 5: Collision handling - "Albany" without "county" → city prioritized
 * - Test 6: Case-insensitive - "ALBANY County" mixed case → 4 rows
 *
 * EVIDENCE STANDARDS:
 * - Real RuntimeEngine with deterministic pipeline
 * - Actual SQL execution against warehouse_hospitals
 * - Row count verification
 * - County/city value verification in returned rows
 * - Zero silent-wrong results
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

interface TestResult {
  testId: string;
  testName: string;
  status: "PASS" | "FAIL";
  evidence: {
    success: boolean;
    rowCount: number;
    expectedRowCount: number | { min: number; max: number };
    allRowsMatchFilter: boolean;
    facilityIds?: string[];
    errorMessage?: string;
    geographicValues?: { county?: string; city?: string; state?: string }[];
  };
  timing: {
    executionMs: number;
  };
  notes?: string;
}

// ============================================================================
// SETUP
// ============================================================================

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const executor = new SqlExecutor(new SupabaseDatabaseAdapter(supabase));

const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
});

// ============================================================================
// UTILITY
// ============================================================================

function log(message: string) {
  console.log(message);
}

function extractGeographicValues(rows: any[]): { county?: string; city?: string; state?: string }[] {
  return rows.map((r) => ({
    county: r.county || r.County,
    city: r.city || r.City,
    state: r.state || r.State,
  }));
}

function extractFacilityIds(rows: any[]): string[] {
  return rows
    .map((r) => r.facility_id || r.facilityId)
    .filter((id) => id != null);
}

// ============================================================================
// TEST CASES
// ============================================================================

async function test1_AlbanyCountyFilter(): Promise<TestResult> {
  const testId = "T1";
  const testName = "County filter - ALBANY county → 4 facilities NOT 52";
  
  log(`\n${testId}: ${testName}`);
  const startMs = Date.now();
  
  try {
    const result = await engine.execute({
      question: "Show me the highest-rated hospitals in New York for ALBANY county",
    });
    
    const executionMs = Date.now() - startMs;
    const rowCount = result.rows?.length || 0;
    const geographicValues = extractGeographicValues(result.rows || []);
    const facilityIds = extractFacilityIds(result.rows || []);
    
    // Expected: 4 facilities in Albany County, NY
    // 330013 - Albany Medical Center
    // 330057 - St Peter's Hospital
    // 33009F - Albany VA Medical Center
    // 334046 - Capital District Psychiatric Center
    const expectedFacilities = ["330013", "330057", "33009F", "334046"];
    
    const allRowsMatchFilter = geographicValues.every(
      (v) => v.county === "ALBANY" && v.state === "NY"
    );
    
    const status = 
      result.success &&
      rowCount === 4 &&
      allRowsMatchFilter &&
      expectedFacilities.every(id => facilityIds.includes(id))
        ? "PASS"
        : "FAIL";
    
    log(`  Result: ${result.success ? "SUCCESS" : "FAIL"}`);
    log(`  Row count: ${rowCount} (expected: 4)`);
    log(`  All rows ALBANY county NY: ${allRowsMatchFilter}`);
    log(`  Facility IDs: ${facilityIds.join(", ")}`);
    log(`  Status: ${status}`);
    
    return {
      testId,
      testName,
      status,
      evidence: {
        success: result.success,
        rowCount,
        expectedRowCount: 4,
        allRowsMatchFilter,
        facilityIds,
        geographicValues,
      },
      timing: { executionMs },
    };
  } catch (error) {
    log(`  ERROR: ${error}`);
    return {
      testId,
      testName,
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        expectedRowCount: 4,
        allRowsMatchFilter: false,
        errorMessage: String(error),
      },
      timing: { executionMs: Date.now() - startMs },
    };
  }
}

async function test2_ByCountyDimensionalGrouping(): Promise<TestResult> {
  const testId = "T2";
  const testName = "Dimensional grouping preserved - by county → 52 rows";
  
  log(`\n${testId}: ${testName}`);
  const startMs = Date.now();
  
  try {
    const result = await engine.execute({
      question: "Show me the highest-rated hospitals in New York by county",
    });
    
    const executionMs = Date.now() - startMs;
    const rowCount = result.rows?.length || 0;
    const geographicValues = extractGeographicValues(result.rows || []);
    
    // Expected: 52 rows (one per county in NY with hospitals)
    // This is dimensional grouping, NOT filtering
    const allRowsNY = geographicValues.every((v) => v.state === "NY");
    
    const status =
      result.success &&
      rowCount === 52 &&
      allRowsNY
        ? "PASS"
        : "FAIL";
    
    log(`  Result: ${result.success ? "SUCCESS" : "FAIL"}`);
    log(`  Row count: ${rowCount} (expected: 52)`);
    log(`  All rows NY: ${allRowsNY}`);
    log(`  Status: ${status}`);
    
    return {
      testId,
      testName,
      status,
      evidence: {
        success: result.success,
        rowCount,
        expectedRowCount: 52,
        allRowsMatchFilter: allRowsNY,
        geographicValues,
      },
      timing: { executionMs },
    };
  } catch (error) {
    log(`  ERROR: ${error}`);
    return {
      testId,
      testName,
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        expectedRowCount: 52,
        allRowsMatchFilter: false,
        errorMessage: String(error),
      },
      timing: { executionMs: Date.now() - startMs },
    };
  }
}

async function test3_BirminghamCityFilter(): Promise<TestResult> {
  const testId = "T3";
  const testName = "City filter - Birmingham, Alabama → 9 facilities NOT 100";
  
  log(`\n${testId}: ${testName}`);
  const startMs = Date.now();
  
  try {
    const result = await engine.execute({
      question: "Show me hospitals in Birmingham, Alabama with their overall ratings",
    });
    
    const executionMs = Date.now() - startMs;
    const rowCount = result.rows?.length || 0;
    const geographicValues = extractGeographicValues(result.rows || []);
    const facilityIds = extractFacilityIds(result.rows || []);
    
    // Expected: 9 facilities in Birmingham, AL (not 100 statewide)
    const allRowsMatchFilter = geographicValues.every(
      (v) => v.city === "BIRMINGHAM" && v.state === "AL"
    );
    
    const status =
      result.success &&
      rowCount === 9 &&
      allRowsMatchFilter
        ? "PASS"
        : "FAIL";
    
    log(`  Result: ${result.success ? "SUCCESS" : "FAIL"}`);
    log(`  Row count: ${rowCount} (expected: 9)`);
    log(`  All rows BIRMINGHAM AL: ${allRowsMatchFilter}`);
    log(`  Facility IDs: ${facilityIds.join(", ")}`);
    log(`  Status: ${status}`);
    
    return {
      testId,
      testName,
      status,
      evidence: {
        success: result.success,
        rowCount,
        expectedRowCount: 9,
        allRowsMatchFilter,
        facilityIds,
        geographicValues,
      },
      timing: { executionMs },
    };
  } catch (error) {
    log(`  ERROR: ${error}`);
    return {
      testId,
      testName,
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        expectedRowCount: 9,
        allRowsMatchFilter: false,
        errorMessage: String(error),
      },
      timing: { executionMs: Date.now() - startMs },
    };
  }
}

async function test4_BareCountyResolution(): Promise<TestResult> {
  const testId = "T4";
  const testName = "Bare county resolution - 'Best Hospital in ALBANY county' works";
  
  log(`\n${testId}: ${testName}`);
  const startMs = Date.now();
  
  try {
    const result = await engine.execute({
      question: "Best Hospital in ALBANY county",
    });
    
    const executionMs = Date.now() - startMs;
    const rowCount = result.rows?.length || 0;
    const geographicValues = extractGeographicValues(result.rows || []);
    const facilityIds = extractFacilityIds(result.rows || []);
    
    // Expected: 1-4 rows (best hospitals in Albany County)
    // Must NOT be "Unable to create query plan"
    const allRowsMatchFilter = geographicValues.every(
      (v) => v.county === "ALBANY"
    );
    
    const status =
      result.success &&
      rowCount >= 1 &&
      rowCount <= 4 &&
      allRowsMatchFilter
        ? "PASS"
        : "FAIL";
    
    log(`  Result: ${result.success ? "SUCCESS" : "FAIL"}`);
    log(`  Row count: ${rowCount} (expected: 1-4)`);
    log(`  All rows ALBANY county: ${allRowsMatchFilter}`);
    log(`  Facility IDs: ${facilityIds.join(", ")}`);
    log(`  Status: ${status}`);
    
    return {
      testId,
      testName,
      status,
      evidence: {
        success: result.success,
        rowCount,
        expectedRowCount: { min: 1, max: 4 },
        allRowsMatchFilter,
        facilityIds,
        geographicValues,
      },
      timing: { executionMs },
    };
  } catch (error) {
    log(`  ERROR: ${error}`);
    return {
      testId,
      testName,
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        expectedRowCount: { min: 1, max: 4 },
        allRowsMatchFilter: false,
        errorMessage: String(error),
      },
      timing: { executionMs: Date.now() - startMs },
    };
  }
}

async function test5_CollisionHandling(): Promise<TestResult> {
  const testId = "T5";
  const testName = "Collision handling - 'Albany' without 'county' → city prioritized";
  
  log(`\n${testId}: ${testName}`);
  const startMs = Date.now();
  
  try {
    const result = await engine.execute({
      question: "Hospitals in Albany",
    });
    
    const executionMs = Date.now() - startMs;
    const rowCount = result.rows?.length || 0;
    const geographicValues = extractGeographicValues(result.rows || []);
    const facilityIds = extractFacilityIds(result.rows || []);
    
    // Expected: Resolves to city ALBANY (not county)
    // Albany exists as both city and county, but city should be prioritized
    // when "county" suffix is absent
    const allRowsCity = geographicValues.every(
      (v) => v.city === "ALBANY"
    );
    
    const status =
      result.success &&
      rowCount > 0 &&
      allRowsCity
        ? "PASS"
        : "FAIL";
    
    log(`  Result: ${result.success ? "SUCCESS" : "FAIL"}`);
    log(`  Row count: ${rowCount}`);
    log(`  All rows city ALBANY: ${allRowsCity}`);
    log(`  Facility IDs: ${facilityIds.join(", ")}`);
    log(`  Status: ${status}`);
    
    return {
      testId,
      testName,
      status,
      evidence: {
        success: result.success,
        rowCount,
        expectedRowCount: { min: 1, max: 100 },
        allRowsMatchFilter: allRowsCity,
        facilityIds,
        geographicValues,
      },
      timing: { executionMs },
      notes: "Bare 'Albany' should resolve to city, not county (collision prioritization)",
    };
  } catch (error) {
    log(`  ERROR: ${error}`);
    return {
      testId,
      testName,
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        expectedRowCount: { min: 1, max: 100 },
        allRowsMatchFilter: false,
        errorMessage: String(error),
      },
      timing: { executionMs: Date.now() - startMs },
    };
  }
}

async function test6_CaseInsensitive(): Promise<TestResult> {
  const testId = "T6";
  const testName = "Case-insensitive - 'ALBANY County' mixed case → 4 rows";
  
  log(`\n${testId}: ${testName}`);
  const startMs = Date.now();
  
  try {
    const result = await engine.execute({
      question: "Show me hospitals in ALBANY County, New York",
    });
    
    const executionMs = Date.now() - startMs;
    const rowCount = result.rows?.length || 0;
    const geographicValues = extractGeographicValues(result.rows || []);
    const facilityIds = extractFacilityIds(result.rows || []);
    
    // Expected: 4 facilities in Albany County, NY (same as T1)
    const allRowsMatchFilter = geographicValues.every(
      (v) => v.county === "ALBANY" && v.state === "NY"
    );
    
    const status =
      result.success &&
      rowCount === 4 &&
      allRowsMatchFilter
        ? "PASS"
        : "FAIL";
    
    log(`  Result: ${result.success ? "SUCCESS" : "FAIL"}`);
    log(`  Row count: ${rowCount} (expected: 4)`);
    log(`  All rows ALBANY county NY: ${allRowsMatchFilter}`);
    log(`  Facility IDs: ${facilityIds.join(", ")}`);
    log(`  Status: ${status}`);
    
    return {
      testId,
      testName,
      status,
      evidence: {
        success: result.success,
        rowCount,
        expectedRowCount: 4,
        allRowsMatchFilter,
        facilityIds,
        geographicValues,
      },
      timing: { executionMs },
    };
  } catch (error) {
    log(`  ERROR: ${error}`);
    return {
      testId,
      testName,
      status: "FAIL",
      evidence: {
        success: false,
        rowCount: 0,
        expectedRowCount: 4,
        allRowsMatchFilter: false,
        errorMessage: String(error),
      },
      timing: { executionMs: Date.now() - startMs },
    };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("=".repeat(80));
  console.log("Pre-Phase 9 Tier0 Task 1 - Geographic Value Filtering Verification");
  console.log("=".repeat(80));
  
  const results: TestResult[] = [];
  
  // Execute all tests
  results.push(await test1_AlbanyCountyFilter());
  results.push(await test2_ByCountyDimensionalGrouping());
  results.push(await test3_BirminghamCityFilter());
  results.push(await test4_BareCountyResolution());
  results.push(await test5_CollisionHandling());
  results.push(await test6_CaseInsensitive());
  
  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const totalCount = results.length;
  
  results.forEach((r) => {
    console.log(`${r.testId} ${r.status.padEnd(7)} ${r.testName}`);
  });
  
  console.log("\n" + "-".repeat(80));
  console.log(`PASS: ${passCount}/${totalCount}`);
  console.log(`FAIL: ${failCount}/${totalCount}`);
  console.log("=".repeat(80));
  
  // Exit with appropriate code
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
