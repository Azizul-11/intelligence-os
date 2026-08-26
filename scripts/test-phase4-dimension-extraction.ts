/**
 * Phase 4.1 Dimension Extraction Test
 * 
 * Tests that dimension aliases are extracted into SemanticCollections.dimensions
 * 
 * NOTE: This test relies on console log output from the orchestrator.
 * Check Supabase logs for semantic extraction validation.
 */

const ORCHESTRATOR_URL = "http://127.0.0.1:54321/functions/v1/orchestrator";

interface TestCase {
  id: string;
  description: string;
  question: string;
}

const DIMENSION_TESTS: TestCase[] = [
  {
    id: "D1",
    description: "County dimension: 'by county'",
    question: "highest rated hospitals in texas by county",
  },
  {
    id: "D2",
    description: "County dimension: 'counties'",
    question: "show hospitals in texas for all counties",
  },
  {
    id: "D3",
    description: "State dimension: 'by state'",
    question: "hospital count by state",
  },
  {
    id: "D4",
    description: "Year dimension: 'by year'",
    question: "mortality rates by year",
  },
  {
    id: "D5",
    description: "Multi-type: metric + entity + dimension",
    question: "best hospitals in california by county",
  },
];

async function testDimensionExtraction(test: TestCase): Promise<boolean> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`TEST ${test.id}: ${test.description}`);
  console.log(`Question: "${test.question}"`);
  console.log(`${"=".repeat(80)}`);

  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: test.question,
      }),
    });

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      return false;
    }

    const result = await response.json();

    console.log(`\n📊 RESULT:`);
    console.log(`  Success: ${result.success}`);
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`);
      return false;
    }

    console.log(`  ✅ Query executed successfully`);
    console.log(`  ⚠️  Check Supabase logs for semantic extraction validation`);
    
    return result.success;
    
  } catch (error) {
    console.error(`\n❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function runTests() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 4.1 - DIMENSION EXTRACTION TESTS");
  console.log("=".repeat(80));
  console.log("\nNOTE: Semantic extraction validation requires checking Supabase logs.");
  console.log("Look for 'SEMANTIC RESULT' and 'dimensions' array in orchestrator output.\n");
  
  let passed = 0;
  let failed = 0;
  
  for (const test of DIMENSION_TESTS) {
    const result = await testDimensionExtraction(test);
    
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log("\n" + "=".repeat(80));
  console.log("FINAL RESULTS");
  console.log("=".repeat(80));
  console.log(`✅ Passed: ${passed}/${DIMENSION_TESTS.length}`);
  console.log(`❌ Failed: ${failed}/${DIMENSION_TESTS.length}`);
  
  if (failed === 0) {
    console.log("\n🎉 ALL DIMENSION EXTRACTION TESTS EXECUTED");
    console.log("⚠️  Verify semantic extraction in Supabase logs");
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed to execute`);
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

runTests();


