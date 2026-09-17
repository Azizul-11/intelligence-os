/**
 * Verification script for Bug A/C — Single-Hospital Dossier Regression
 * 
 * Reproduces the exact queries that broke after Round 3's crowd-out fix.
 * Expected: All queries should return success=true, rowCount=1, correct facility.
 * 
 * Run with: npx tsx scripts/verify-bug-a-c-single-hospital-dossier-regression.ts
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
  query: string;
  expectedFacilityId: string;
  expectedCity: string;
  expectedState: string;
}

const testCases: TestCase[] = [
  {
    query: "tell me about Mayo Clinic",
    expectedFacilityId: "100151", // Jacksonville
    expectedCity: "JACKSONVILLE",
    expectedState: "FL",
  },
  {
    query: "tell me about Cleveland Clinic",
    expectedFacilityId: "360180",
    expectedCity: "CLEVELAND",
    expectedState: "OH",
  },
  {
    query: "tell me about NYU LANGONE HOSPITALS",
    expectedFacilityId: "330214",
    expectedCity: "NEW YORK",
    expectedState: "NY",
  },
  {
    query: "ADVENTIST HEALTH HOWARD MEMORIAL",
    expectedFacilityId: "051310",
    expectedCity: "WILLITS",
    expectedState: "CA",
  },
  {
    query: "tell me about ADVENTIST HEALTH HOWARD MEMORIAL",
    expectedFacilityId: "051310",
    expectedCity: "WILLITS",
    expectedState: "CA",
  },
  {
    query: "show me ADVENTIST HEALTH HOWARD MEMORIAL",
    expectedFacilityId: "051310",
    expectedCity: "WILLITS",
    expectedState: "CA",
  },
  {
    query: "ADVENTHEALTH GORDON",
    expectedFacilityId: "110023",
    expectedCity: "CALHOUN",
    expectedState: "GA",
  },
  {
    query: "tell me about ADVENTHEALTH GORDON",
    expectedFacilityId: "110023",
    expectedCity: "CALHOUN",
    expectedState: "GA",
  },
  {
    query: "show me ADVENTHEALTH GORDON",
    expectedFacilityId: "110023",
    expectedCity: "CALHOUN",
    expectedState: "GA",
  },
  {
    query: "tell me about ADVENTHEALTH GORDON hospital",
    expectedFacilityId: "110023",
    expectedCity: "CALHOUN",
    expectedState: "GA",
  },
  {
    query: "BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS",
    expectedFacilityId: "670078",
    expectedCity: "SAN ANTONIO",
    expectedState: "TX",
  },
  {
    query: "tell me about BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS",
    expectedFacilityId: "670078",
    expectedCity: "SAN ANTONIO",
    expectedState: "TX",
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  try {
    const result = await engine.execute({
      question: testCase.query,
    });

    if (!result.success) {
      console.error(`❌ FAIL: "${testCase.query}"`);
      console.error(`   Expected: success=true, rowCount=1, facility=${testCase.expectedFacilityId}`);
      console.error(`   Actual: success=false`);
      if (result.error) {
        console.error(`   Error: ${result.error}`);
      }
      return false;
    }

    if (result.rowCount === 0) {
      console.error(`❌ FAIL: "${testCase.query}"`);
      console.error(`   Expected: rowCount=1, facility=${testCase.expectedFacilityId}`);
      console.error(`   Actual: rowCount=0`);
      return false;
    }

    if (result.rowCount !== 1) {
      console.error(`❌ FAIL: "${testCase.query}"`);
      console.error(`   Expected: rowCount=1, facility=${testCase.expectedFacilityId}`);
      console.error(`   Actual: rowCount=${result.rowCount} (silent wrong - returning multiple rows)`);
      return false;
    }

    const row = (result.rows ?? [])[0] as Record<string, unknown>;
    const actualFacilityId = row.facility_id as string;
    const actualCity = row.city as string;
    const actualState = row.state as string;

    if (actualFacilityId !== testCase.expectedFacilityId) {
      console.error(`❌ FAIL: "${testCase.query}"`);
      console.error(`   Expected: facility=${testCase.expectedFacilityId}`);
      console.error(`   Actual: facility=${actualFacilityId}`);
      return false;
    }

    if (actualCity !== testCase.expectedCity || actualState !== testCase.expectedState) {
      console.error(`❌ FAIL: "${testCase.query}"`);
      console.error(`   Expected: ${testCase.expectedCity}, ${testCase.expectedState}`);
      console.error(`   Actual: ${actualCity}, ${actualState}`);
      return false;
    }

    console.log(`✅ PASS: "${testCase.query}" -> ${actualFacilityId} ${actualCity}, ${actualState}`);
    return true;
  } catch (error) {
    console.error(`❌ FAIL: "${testCase.query}"`);
    console.error(`   Unexpected error: ${error}`);
    return false;
  }
}

async function main() {
  console.log("Bug A/C Verification — Single-Hospital Dossier Regression\n");

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const success = await runTest(testCase);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Total: ${testCases.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`${"=".repeat(60)}\n`);

  if (failed > 0) {
    console.log("❌ Bug A/C still present — single-hospital dossier lookups broken");
    process.exit(1);
  } else {
    console.log("✅ Bug A/C fixed — all single-hospital dossier lookups working");
    process.exit(0);
  }
}

main();
