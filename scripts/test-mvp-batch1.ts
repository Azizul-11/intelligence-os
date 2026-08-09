/**
 * MVP Capability Expansion Batch #1 - Live Test
 * 
 * Tests 7 queries:
 * - 2 existing (regression test)
 * - 5 new capabilities
 */

const ORCHESTRATOR_URL = "http://127.0.0.1:54321/functions/v1/orchestrator";

interface TestQuery {
  id: string;
  description: string;
  question: string;
  expectedMetric?: string;
  expectedIntent?: string;
  expectedTemplate?: string;
}

const TEST_QUERIES: TestQuery[] = [
  // EXISTING - Regression Tests
  {
    id: "E1",
    description: "Existing: Overall rating ranking (no entity)",
    question: "highest rated hospitals",
    expectedMetric: "hospital-overall-rating",
    expectedIntent: "ranking",
    expectedTemplate: "hospital-overall-rating-ranking",
  },
  {
    id: "E2",
    description: "Existing: Overall rating ranking with state entity",
    question: "best hospitals in texas",
    expectedMetric: "hospital-overall-rating",
    expectedIntent: "ranking",
    expectedTemplate: "hospital-overall-rating-ranking",
  },
  
  // NEW - Batch #1 Capabilities
  {
    id: "N1",
    description: "New: Mortality rate ranking",
    question: "best hospitals for mortality in Texas",
    expectedMetric: "mortality-rate",
    expectedIntent: "ranking",
    expectedTemplate: "mortality-rate-ranking",
  },
  {
    id: "N2",
    description: "New: Readmission rate ranking",
    question: "hospitals with lowest readmission rates",
    expectedMetric: "readmission-rate",
    expectedIntent: "ranking",
    expectedTemplate: "readmission-rate-ranking",
  },
  {
    id: "N3",
    description: "New: Patient experience ranking",
    question: "hospitals with best patient satisfaction",
    expectedMetric: "patient-experience",
    expectedIntent: "ranking",
    expectedTemplate: "patient-experience-ranking",
  },
  {
    id: "N4",
    description: "New: Hospital count by state",
    question: "how many hospitals are in California",
    expectedMetric: "hospital-count",
    expectedIntent: "aggregation",
    expectedTemplate: "hospital-count-by-state",
  },
  {
    id: "N5",
    description: "New: Hospital list by state",
    question: "show me hospitals in Texas",
    expectedMetric: "hospital-list",
    expectedIntent: "lookup",
    expectedTemplate: "hospital-list-by-state",
  },
];

async function testQuery(query: TestQuery): Promise<boolean> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`TEST ${query.id}: ${query.description}`);
  console.log(`Question: "${query.question}"`);
  console.log(`${"=".repeat(80)}`);

  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: query.question,
      }),
    });

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      return false;
    }

    const result = await response.json();

    // Check for error first
    if (result.error) {
      console.log("\n📊 RESULT:");
      console.log(`  Success: ${result.success}`);
      console.log(`  ❌ Error: ${result.error}`);
      console.log(`\n❌ FAIL: Query returned error`);
      return false;
    }

    // Parse the answer JSON string
    let rows: any[] = [];
    if (result.answer && typeof result.answer === 'string' && result.answer.trim()) {
      try {
        rows = JSON.parse(result.answer);
      } catch (parseError) {
        console.error(`\n❌ FAIL: Unable to parse answer JSON`);
        console.error(`Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        return false;
      }
    }

    const rowCount = rows.length;
    const metadataCount = result.metadata?.rowCount;

    console.log("\n📊 RESULT:");
    console.log(`  Success: ${result.success}`);
    console.log(`  Row Count: ${rowCount}`);
    if (metadataCount !== undefined && metadataCount !== rowCount) {
      console.log(`  Metadata Count: ${metadataCount}`);
    }

    if (rows.length > 0) {
      console.log(`\n  Sample Row (first):`);
      console.log(`  ${JSON.stringify(rows[0], null, 2)}`);
    }

    // Validation
    if (!result.success) {
      console.log(`\n❌ FAIL: success = false`);
      return false;
    }

    // Check for zero rows (except for count queries which might legitimately return 0)
    const isCountQuery = query.id === "N4"; // hospital count query
    const expectRows = !isCountQuery;

    if (expectRows && rowCount === 0) {
      console.log(`\n❌ FAIL: Query executed successfully but returned 0 rows`);
      console.log(`  This indicates:`);
      console.log(`  - Empty data in warehouse`);
      console.log(`  - Incorrect SQL filter`);
      console.log(`  - Missing entity parameter`);
      return false;
    }

    console.log(`\n✅ PASS: Query executed successfully with ${rowCount} row${rowCount !== 1 ? 's' : ''}`);
    return true;

  } catch (error) {
    console.error(`\n❌ Exception: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════════════════╗");
  console.log("║         MVP CAPABILITY EXPANSION - BATCH #1 LIVE TEST SUITE               ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════╝");
  console.log(`\nOrchestrator: ${ORCHESTRATOR_URL}`);
  console.log(`Total Tests: ${TEST_QUERIES.length} (2 existing + 5 new)`);

  let passed = 0;
  let failed = 0;

  for (const query of TEST_QUERIES) {
    try {
      const result = await testQuery(query);
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      console.error(`Test ${query.id} threw exception:`, error);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total:  ${TEST_QUERIES.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED");
  } else {
    console.log(`\n⚠️  ${failed} TEST(S) FAILED`);
  }
  console.log("=".repeat(80));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
