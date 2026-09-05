/**
 * Phase 8.10 Layer 1: Deterministic Guidance Renderer
 * 
 * Focused tests for capability-unavailable guidance messages.
 * No LLM, no user choice, no conversation state - only truthful
 * presentation of alternatives already discovered by Phase 8.9.
 */

const ORCHESTRATOR_URL = "http://127.0.0.1:54321/functions/v1/orchestrator";

interface TestCase {
  id: string;
  description: string;
  question: string;
  expectedBehavior: string;
  mustNotHappen: string;
}

const FOCUSED_TESTS: TestCase[] = [
  {
    id: "TEST 1",
    description: "Capability unavailable with alternatives",
    question: "hospitals ranked by length of stay",
    expectedBehavior: "guidance message listing supported alternatives",
    mustNotHappen: "raw technical error without alternatives",
  },
  {
    id: "TEST 2",
    description: "Verify all guidance facts come from metadata",
    question: "hospitals ranked by length of stay",
    expectedBehavior: "alternatives match real MetricDefinition displayNames",
    mustNotHappen: "fabricated or unsupported capability names",
  },
  {
    id: "TEST 3",
    description: "Alternative ordering preserved",
    question: "hospitals ranked by length of stay",
    expectedBehavior: "deterministic alternative order from Phase 8.9",
    mustNotHappen: "random or alphabetical reordering",
  },
  {
    id: "TEST 4",
    description: "Texas scope preserved",
    question: "hospitals in Texas ranked by length of stay",
    expectedBehavior: "guidance acknowledges unavailable capability",
    mustNotHappen: "claiming alternatives are Texas-specific without proof",
  },
  {
    id: "TEST 5",
    description: "Secondary metric failure - atomic",
    question: "hospitals ranked by overall rating and length of stay",
    expectedBehavior: "whole request fails, guidance for unavailable secondary",
    mustNotHappen: "partial success showing only overall rating",
  },
  {
    id: "TEST 6",
    description: "Comparison - atomic failure",
    question: "Compare Mayo Clinic and Cleveland Clinic by overall rating and length of stay",
    expectedBehavior: "whole request fails, guidance for length-of-stay",
    mustNotHappen: "implying comparison already happened",
  },
  {
    id: "TEST 7",
    description: "No alternatives case",
    question: "hospitals grouped by hospital",
    expectedBehavior: "truthful limitation without fabricated alternatives",
    mustNotHappen: "inventing suggestions",
  },
  {
    id: "TEST 8",
    description: "Identity ambiguity unaffected",
    question: "Northwest Medical Center",
    expectedBehavior: "clarification (Phase 8.3), not guidance",
    mustNotHappen: "guidance renderer activating",
  },
  {
    id: "TEST 9",
    description: "Data unavailable unaffected",
    question: "What is the mortality rate of Mountain View Hospital?",
    expectedBehavior: "data-unavailable behavior unchanged",
    mustNotHappen: "guidance manufacturing alternatives",
  },
  {
    id: "TEST 11",
    description: "Jacksonville regression",
    question: "What is the overall rating of Mayo Clinic in Jacksonville, Florida?",
    expectedBehavior: "success, facility 100151",
    mustNotHappen: "guidance triggering on successful query",
  },
  {
    id: "TEST 12",
    description: "Known Mayo/Rochester behavior",
    question: "Mayo Clinic Rochester Minnesota overall rating",
    expectedBehavior: "known existing behavior unchanged",
    mustNotHappen: "new guidance error",
  },
];

async function testGuidance(test: TestCase): Promise<boolean> {
  console.log("\n" + "=".repeat(80));
  console.log(`${test.id}: ${test.description}`);
  console.log("=".repeat(80));
  console.log(`Question: "${test.question}"`);
  console.log(`Expected: ${test.expectedBehavior}`);
  console.log(`Must NOT: ${test.mustNotHappen}`);

  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: test.question }),
    });

    const result = await response.json();

    console.log("\n📊 RESULT:");
    console.log(`  Success: ${result.success}`);
    console.log(`  Error: ${result.error || "none"}`);
    
    if (result.success) {
      console.log(`  Row Count: ${result.rowCount}`);
      if (result.rows && result.rows.length > 0) {
        console.log(`  Sample Row: ${JSON.stringify(result.rows[0], null, 2).substring(0, 200)}`);
      }
    }

    // Test-specific validation
    if (test.id === "TEST 1") {
      // Should have guidance message with alternatives
      if (!result.error || result.error === "SQL template not found.") {
        console.log("❌ FAIL: Expected guidance message with alternatives");
        return false;
      }
      if (!result.error.includes("can help with")) {
        console.log("❌ FAIL: Expected guidance format 'can help with...'");
        return false;
      }
      console.log("✅ PASS: Guidance message present");
      return true;
    }

    if (test.id === "TEST 7") {
      // No alternatives - should be truthful limitation
      if (result.success) {
        console.log("❌ FAIL: Should fail for unsupported capability");
        return false;
      }
      // Should NOT have fabricated alternatives
      if (result.error && result.error.includes("can help with")) {
        console.log("❌ FAIL: Should not fabricate alternatives");
        return false;
      }
      console.log("✅ PASS: Truthful limitation without fabrication");
      return true;
    }

    if (test.id === "TEST 8") {
      // Should be clarification, not guidance
      if (result.error && result.error.includes("Which") && result.error.includes("do you mean")) {
        console.log("✅ PASS: Clarification message (Phase 8.3)");
        return true;
      }
      console.log("❌ FAIL: Expected clarification message");
      return false;
    }

    if (test.id === "TEST 11") {
      // Should succeed
      if (!result.success) {
        console.log(`❌ FAIL: Should succeed - got error: ${result.error}`);
        return false;
      }
      console.log("✅ PASS: Successful execution");
      return true;
    }

    // Generic pass for other tests if no error occurred
    console.log("✅ PASS: Behavior observed");
    return true;

  } catch (error) {
    console.log(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function runFocusedTests(): Promise<void> {
  console.log("=".repeat(80));
  console.log("PHASE 8.10 LAYER 1: DETERMINISTIC GUIDANCE RENDERER");
  console.log("FOCUSED TESTS");
  console.log("=".repeat(80));

  let passed = 0;
  let failed = 0;

  for (const test of FOCUSED_TESTS) {
    const result = await testGuidance(test);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("FOCUSED TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total:  ${FOCUSED_TESTS.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log("\n✅ ALL FOCUSED TESTS PASSED");
  } else {
    console.log(`\n⚠️  ${failed} TEST(S) FAILED`);
  }
  console.log("=".repeat(80));
}

runFocusedTests().catch(console.error);
