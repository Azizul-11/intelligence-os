#!/usr/bin/env tsx

/**
 * Verification script for Bug A/C Complete 12/12 + Bug B + Comparison Fix
 *
 * Tests all 12 single-hospital queries + comparison queries + controls
 * Verifies no regressions on previously passing queries
 *
 * Runs against the DEPLOYED orchestrator using the current wire contract
 * (the same request the frontend sends): POST { question, domain } with the
 * anon key in `apikey` + `Authorization`; the response carries the rows as a
 * JSON string in `answer`. (The original request body { query, sessionId }
 * without auth returns HTTP 500 on the current function.)
 *
 * Usage:
 *   pnpm tsx scripts/verify-bug-a-c-complete-12-12.ts
 */

import { env } from "./shared/env";

const SUPABASE_URL = "https://uejnblmhappddtbablki.supabase.co/functions/v1/orchestrator";

interface TestCase {
  name: string;
  query: string;
  expectedRows: number | string; // number or "1+" for at least 1
  expectedFacilityId?: string | string[]; // optional facility ID verification
  mustInclude?: string[]; // optional field checks
  category: "tell-me-about" | "bare" | "overlap" | "comparison" | "control";
}

const testCases: TestCase[] = [
  // Previously passing 7/12 - "tell me about" variations
  {
    name: "1. tell me about Mayo Clinic",
    query: "tell me about Mayo Clinic",
    expectedRows: 1,
    expectedFacilityId: "100151",
    category: "tell-me-about",
  },
  {
    name: "2. tell me about Cleveland Clinic",
    query: "tell me about Cleveland Clinic",
    expectedRows: 1,
    expectedFacilityId: "360180",
    category: "tell-me-about",
  },
  {
    name: "3. tell me about NYU LANGONE HOSPITALS",
    query: "tell me about NYU LANGONE HOSPITALS",
    expectedRows: 1,
    expectedFacilityId: "330214",
    category: "tell-me-about",
  },
  {
    name: "4. tell me about ADVENTIST HEALTH HOWARD MEMORIAL",
    query: "tell me about ADVENTIST HEALTH HOWARD MEMORIAL",
    expectedRows: 1,
    expectedFacilityId: "051310",
    category: "tell-me-about",
  },
  {
    name: "5. tell me about ADVENTHEALTH GORDON",
    query: "tell me about ADVENTHEALTH GORDON",
    expectedRows: 1,
    expectedFacilityId: "110023",
    category: "tell-me-about",
  },
  {
    name: "6. tell me about ADVENTHEALTH GORDON hospital",
    query: "tell me about ADVENTHEALTH GORDON hospital",
    expectedRows: 1,
    expectedFacilityId: "110023",
    category: "tell-me-about",
  },
  {
    name: "7. tell me about BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS",
    query: "tell me about BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS",
    expectedRows: 1,
    expectedFacilityId: "670078",
    category: "tell-me-about",
  },

  // Now fixed 5/12 - bare hospital names
  {
    name: "8. ADVENTIST HEALTH HOWARD MEMORIAL (bare)",
    query: "ADVENTIST HEALTH HOWARD MEMORIAL",
    expectedRows: 1,
    expectedFacilityId: "051310",
    category: "bare",
  },
  {
    name: "9. show me ADVENTIST HEALTH HOWARD MEMORIAL",
    query: "show me ADVENTIST HEALTH HOWARD MEMORIAL",
    expectedRows: 1,
    expectedFacilityId: "051310",
    category: "bare",
  },
  {
    name: "10. ADVENTHEALTH GORDON (bare)",
    query: "ADVENTHEALTH GORDON",
    expectedRows: 1,
    expectedFacilityId: "110023",
    category: "bare",
  },
  {
    name: "11. show me ADVENTHEALTH GORDON",
    query: "show me ADVENTHEALTH GORDON",
    expectedRows: 1,
    expectedFacilityId: "110023",
    category: "bare",
  },
  {
    name: "12. BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS (bare)",
    query: "BAPTIST NEIGHBORHOOD HOSPITAL THOUSAND OAKS",
    expectedRows: 1,
    expectedFacilityId: "670078",
    category: "bare",
  },

  // Bug B overlap test
  {
    name: "Bug B: ADVENTIST HEALTH HOWARD MEMORIAL hospital (overlap test)",
    query: "ADVENTIST HEALTH HOWARD MEMORIAL hospital",
    expectedRows: 1,
    expectedFacilityId: "051310", // Must NOT return 041311 Nashville AR
    category: "overlap",
  },

  // Comparison queries
  {
    name: "Comparison: ADVENTIST vs CASTLE ROCK (bare)",
    query: "ADVENTIST HEALTH HOWARD MEMORIAL vs ADVENTHEALTH CASTLE ROCK",
    expectedRows: 2,
    expectedFacilityId: ["051310"], // At least first one should be correct
    category: "comparison",
  },
  {
    name: "Comparison: compare ADVENTIST vs CASTLE ROCK",
    query: "compare ADVENTIST HEALTH HOWARD MEMORIAL vs ADVENTHEALTH CASTLE ROCK",
    expectedRows: 2,
    expectedFacilityId: ["051310"],
    category: "comparison",
  },

  // Control tests - must stay working
  {
    name: "Control: compare CHRISTUS vs EISENHOWER",
    query: "compare CHRISTUS MOTHER FRANCES HOSPITAL vs EISENHOWER MEDICAL CENTER",
    expectedRows: 2,
    expectedFacilityId: ["050573", "450102"],
    category: "control",
  },
  {
    name: "Control: government hospitals in Texas (crowd-out fix)",
    query: "government hospitals in Texas",
    expectedRows: 10, // Ranked, not 100
    category: "control",
  },
  {
    name: "Control: hospitals in Texas (full list)",
    query: "hospitals in Texas",
    expectedRows: "1+", // Full list, should be many
    category: "control",
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  try {
    const response = await fetch(SUPABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
      },
      body: JSON.stringify({
        question: testCase.query,
        domain: "healthcare",
      }),
    });

    if (!response.ok) {
      console.error(`❌ ${testCase.name}`);
      console.error(`   HTTP ${response.status}: ${response.statusText}`);
      return false;
    }

    const result = await response.json();

    // Check if query succeeded
    if (!result.success) {
      console.error(`❌ ${testCase.name}`);
      console.error(`   Query failed: ${result.error || "Unknown error"}`);
      return false;
    }

    // Rows come back as a JSON string in `answer` (current wire contract)
    let rows: any[] = [];
    try {
      rows = typeof result.answer === "string" ? JSON.parse(result.answer) : result.answer ?? [];
    } catch {
      rows = [];
    }

    // Check row count
    const actualRows = rows.length;
    const expectedRows = testCase.expectedRows;

    if (expectedRows === "1+") {
      if (actualRows < 1) {
        console.error(`❌ ${testCase.name}`);
        console.error(`   Expected at least 1 row, got ${actualRows}`);
        return false;
      }
    } else if (typeof expectedRows === "number") {
      if (actualRows !== expectedRows) {
        console.error(`❌ ${testCase.name}`);
        console.error(`   Expected ${expectedRows} row(s), got ${actualRows}`);
        if (actualRows > 0 && rows[0].facility_id) {
          console.error(`   Facility IDs: ${rows.map((r: any) => r.facility_id).join(", ")}`);
        }
        return false;
      }
    }

    // Check facility IDs if specified
    if (testCase.expectedFacilityId) {
      const expectedIds = Array.isArray(testCase.expectedFacilityId)
        ? testCase.expectedFacilityId
        : [testCase.expectedFacilityId];

      const actualIds = rows.map((r: any) => r.facility_id).filter(Boolean);

      for (const expectedId of expectedIds) {
        if (!actualIds.includes(expectedId)) {
          console.error(`❌ ${testCase.name}`);
          console.error(`   Expected facility_id to include ${expectedId}`);
          console.error(`   Got: ${actualIds.join(", ")}`);
          return false;
        }
      }
    }

    console.log(`✅ ${testCase.name}`);
    if (actualRows > 0 && rows[0].facility_id) {
      const facilityIds = rows.map((r: any) => r.facility_id).join(", ");
      console.log(`   ${actualRows} row(s): ${facilityIds}`);
    } else {
      console.log(`   ${actualRows} row(s)`);
    }

    return true;
  } catch (error) {
    console.error(`❌ ${testCase.name}`);
    console.error(`   Error: ${error}`);
    return false;
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("Bug A/C Complete 12/12 + Bug B + Comparison Verification");
  console.log("=".repeat(80));
  console.log();

  const categories = ["tell-me-about", "bare", "overlap", "comparison", "control"] as const;
  const results: Record<string, { passed: number; failed: number }> = {};

  for (const category of categories) {
    results[category] = { passed: 0, failed: 0 };
  }

  for (const testCase of testCases) {
    const passed = await runTest(testCase);
    if (passed) {
      results[testCase.category].passed++;
    } else {
      results[testCase.category].failed++;
    }
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log();
  console.log("=".repeat(80));
  console.log("Summary by Category");
  console.log("=".repeat(80));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const category of categories) {
    const { passed, failed } = results[category];
    totalPassed += passed;
    totalFailed += failed;

    const status = failed === 0 ? "✅" : "❌";
    console.log(`${status} ${category}: ${passed}/${passed + failed} passed`);
  }

  console.log();
  console.log("=".repeat(80));
  console.log(`Total: ${totalPassed}/${totalPassed + totalFailed} passed`);

  if (totalFailed === 0) {
    console.log("🎉 All tests passed! Bug A/C + Bug B + Comparison COMPLETE ✅");
  } else {
    console.log(`⚠️  ${totalFailed} test(s) failed`);
  }

  console.log("=".repeat(80));

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
