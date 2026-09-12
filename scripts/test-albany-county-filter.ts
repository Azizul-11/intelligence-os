/**
 * Test script to reproduce ALBANY county filter issue
 * 
 * Tests 6 queries:
 * 1. "Best Hospital in ALBANY county" - Expected: fail or 1-4 rows
 * 2. "Best Hospital in New York ALBANY county" - Expected: fail or 1-4 rows
 * 3. "Show me hospital in ALBANY county" - Expected: fail or 1-4 rows
 * 4. "Show me the highest-rated hospitals in ALBANY county" - Expected: FAIL (ALBANY county exists in NY and WY; no state given, so cross-state collision guard rejects rather than silently mixing both states' facilities)
 * 5. "Show me the highest-rated hospitals in New York for ALBANY county" - Expected: 3 rows (of the county's 4 facilities, one - Capital District Psych Center - has a null overall_rating and is correctly excluded)
 * 6. "Show me the highest-rated hospitals in New York by county" - Expected: 52 rows (CORRECT)
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
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

interface TestCase {
  id: string;
  query: string;
  expectedRows: "FAIL" | "1-4" | "52" | number;
  issue: string;
}

const testCases: TestCase[] = [
  {
    id: "Q1",
    query: "Best Hospital in ALBANY county",
    expectedRows: "1-4",
    issue: "Should return 1-4 ALBANY county hospitals, currently fails",
  },
  {
    id: "Q2",
    query: "Best Hospital in New York ALBANY county",
    expectedRows: "1-4",
    issue: "Should return 1-4 ALBANY county hospitals, currently fails",
  },
  {
    id: "Q3",
    query: "Show me hospital in ALBANY county",
    expectedRows: "1-4",
    issue: "Should return 1-4 ALBANY county hospitals, currently fails",
  },
  {
    id: "Q4",
    query: "Show me the highest-rated hospitals in ALBANY county",
    expectedRows: "FAIL",
    issue: "ALBANY county exists in both NY and WY; with no state given this must fail clean (not silently mix both states' facilities)",
  },
  {
    id: "Q5",
    query: "Show me the highest-rated hospitals in New York for ALBANY county",
    expectedRows: 3,
    issue: "FIXED: county filter correctly scopes to Albany County, NY (3 of its 4 facilities have a non-null overall_rating)",
  },
  {
    id: "Q6",
    query: "Show me the highest-rated hospitals in New York by county",
    expectedRows: 52,
    issue: "CORRECT: Returns 52 rows grouped by county",
  },
];

async function main() {
  console.log("=".repeat(80));
  console.log("ALBANY COUNTY FILTER TEST — BEFORE FIX");
  console.log("=".repeat(80));
  console.log();

  for (const testCase of testCases) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`${testCase.id}: "${testCase.query}"`);
    console.log(`Expected: ${testCase.expectedRows} rows`);
    console.log(`Issue: ${testCase.issue}`);
    console.log("-".repeat(80));

    try {
      const result = await engine.execute({
        question: testCase.query,
        parameters: {},
      });

      console.log(`\nResult:`);
      console.log(`  success: ${result.success}`);
      console.log(`  answerability: ${result.answerability?.status} / ${result.answerability?.reason || "N/A"}`);
      console.log(`  rowCount: ${result.rowCount}`);
      console.log(`  error: ${result.error || "N/A"}`);

      if (result.success && result.rows && result.rows.length > 0) {
        console.log(`\nSample rows (first 5):`);
        result.rows.slice(0, 5).forEach((row: any, idx: number) => {
          console.log(`  ${idx + 1}. ${row.facility_id} - ${row.hospital_name} (${row.state} ${row.county || ""})`);
        });

        if (result.rows.length > 5) {
          console.log(`  ... and ${result.rows.length - 5} more rows`);
        }
      }

      // Verdict
      const actualRows = result.rowCount || 0;
      let verdict = "PASS";
      if (testCase.expectedRows === "FAIL") {
        verdict = result.success ? "FAIL (expected failure)" : "PASS";
      } else if (testCase.expectedRows === "1-4") {
        verdict = result.success && actualRows >= 1 && actualRows <= 4 ? "PASS" : "FAIL";
      } else if (typeof testCase.expectedRows === "number") {
        verdict = actualRows === testCase.expectedRows ? "PASS" : "FAIL";
      } else {
        verdict = String(actualRows) === testCase.expectedRows ? "PASS" : "FAIL";
      }

      console.log(`\nVerdict: ${verdict}`);
    } catch (error) {
      console.log(`\nERROR: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`Verdict: FAIL (exception)`);
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log("Expected issues:");
  console.log("- Q1-Q3: Out of scope for this fix - 'Best Hospital'/'Show me hospital' don't map to any metric alias");
  console.log("- Q4: Should FAIL clean - ALBANY county is ambiguous across NY/WY with no state given");
  console.log("- Q5: FIXED - correctly scopes to Albany County, NY (3 rated facilities)");
  console.log("- Q6: Correctly returns 52 rows (grouping by county)");
  console.log("=".repeat(80));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
