#!/usr/bin/env -S pnpm exec tsx

/**
 * P1-2 ACCEPTANCE CRITERIA VERIFICATION
 * Tests the two actual P1-2 natural language queries
 */

const ORCHESTRATOR_URL = "http://127.0.0.1:54321/functions/v1/orchestrator";

interface TestResult {
  query: string;
  success: boolean;
  rowCount: number;
  error?: string;
  template?: string;
  sampleRow?: any;
}

async function testQuery(query: string): Promise<TestResult> {
  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query, domain: "healthcare" }),
    });

    const data = await response.json();

    let parsedData = [];
    if (data.answer) {
      try {
        parsedData = JSON.parse(data.answer);
      } catch (e) {
        // answer might not be JSON
      }
    }

    return {
      query,
      success: data.success || false,
      rowCount: parsedData.length || 0,
      error: data.error,
      sampleRow: parsedData[0],
    };
  } catch (err) {
    return {
      query,
      success: false,
      rowCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("P1-2 ACCEPTANCE CRITERIA VERIFICATION");
  console.log("=".repeat(80));
  console.log("");

  // Test 1: Primary P1-2 Query
  console.log("TEST 1: Primary P1-2 Query");
  console.log("-".repeat(80));
  console.log('Query: "hospitals with better safety outcomes"');
  console.log("");

  const test1 = await testQuery("hospitals with better safety outcomes");

  if (test1.success && test1.rowCount > 0) {
    console.log("✅ PASS");
    console.log(`   Success: ${test1.success}`);
    console.log(`   Row Count: ${test1.rowCount}`);
    
    if (test1.sampleRow) {
      console.log("");
      console.log("   Top Hospital:");
      console.log(`   - Name: ${test1.sampleRow.hospital_name}`);
      console.log(`   - Location: ${test1.sampleRow.city}, ${test1.sampleRow.state}`);
      console.log(`   - Safety Score: ${test1.sampleRow.safety_score}%`);
      console.log(`   - Better Measures: ${test1.sampleRow.safety_measures_better}`);
      console.log(`   - Total Measures: ${test1.sampleRow.facility_safety_measure_count}`);
      
      // Verify safety fields present
      const hasScore = test1.sampleRow.safety_score !== null && test1.sampleRow.safety_score !== undefined;
      const hasMeasures = test1.sampleRow.facility_safety_measure_count > 0;
      const hasBetter = test1.sampleRow.safety_measures_better !== null;
      
      console.log("");
      console.log("   Field Verification:");
      console.log(`   - safety_score present: ${hasScore ? '✅' : '❌'}`);
      console.log(`   - facility_safety_measure_count > 0: ${hasMeasures ? '✅' : '❌'}`);
      console.log(`   - safety_measures_better present: ${hasBetter ? '✅' : '❌'}`);
    }
  } else {
    console.log("❌ FAIL");
    console.log(`   Success: ${test1.success}`);
    console.log(`   Error: ${test1.error || 'Unknown'}`);
    console.log(`   Row Count: ${test1.rowCount}`);
  }

  console.log("");
  console.log("=".repeat(80));
  console.log("");

  // Test 2: Alternative P1-2 Query
  console.log("TEST 2: Alternative P1-2 Query");
  console.log("-".repeat(80));
  console.log('Query: "best hospitals for safety"');
  console.log("");

  const test2 = await testQuery("best hospitals for safety");

  if (test2.success && test2.rowCount > 0) {
    console.log("✅ PASS");
    console.log(`   Success: ${test2.success}`);
    console.log(`   Row Count: ${test2.rowCount}`);
    
    if (test2.sampleRow) {
      console.log("");
      console.log("   Top Hospital:");
      console.log(`   - Name: ${test2.sampleRow.hospital_name}`);
      console.log(`   - Location: ${test2.sampleRow.city}, ${test2.sampleRow.state}`);
      console.log(`   - Safety Score: ${test2.sampleRow.safety_score}%`);
      console.log(`   - Better Measures: ${test2.sampleRow.safety_measures_better}`);
      console.log(`   - Total Measures: ${test2.sampleRow.facility_safety_measure_count}`);
    }
  } else {
    console.log("❌ FAIL");
    console.log(`   Success: ${test2.success}`);
    console.log(`   Error: ${test2.error || 'Unknown'}`);
    console.log(`   Row Count: ${test2.rowCount}`);
  }

  console.log("");
  console.log("=".repeat(80));
  console.log("ACCEPTANCE CRITERIA SUMMARY");
  console.log("=".repeat(80));
  
  const test1Pass = test1.success && test1.rowCount > 0;
  const test2Pass = test2.success && test2.rowCount > 0;
  
  if (test1Pass && test2Pass) {
    console.log("✅ P1-2 ACCEPTANCE CRITERIA: PASS");
    console.log("");
    console.log("Both required P1-2 queries execute successfully:");
    console.log(`  ✅ "hospitals with better safety outcomes" - ${test1.rowCount} rows`);
    console.log(`  ✅ "best hospitals for safety" - ${test2.rowCount} rows`);
  } else {
    console.log("❌ P1-2 ACCEPTANCE CRITERIA: FAIL");
    console.log("");
    if (!test1Pass) console.log('  ❌ "hospitals with better safety outcomes" - FAILED');
    if (!test2Pass) console.log('  ❌ "best hospitals for safety" - FAILED');
    process.exit(1);
  }
  
  console.log("=".repeat(80));
}

main().catch(console.error);
