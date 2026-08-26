#!/usr/bin/env -S pnpm exec tsx

/**
 * Test local orchestrator connectivity and P1-2 capability
 */

const ORCHESTRATOR_URL = "http://127.0.0.1:54321/functions/v1/orchestrator";

async function testLocalOrchestrator() {
  console.log("=".repeat(80));
  console.log("LOCAL ORCHESTRATOR DEPLOYMENT VERIFICATION");
  console.log("=".repeat(80));
  console.log("");

  // Test 1: Basic connectivity
  console.log("TEST 1: Basic Connectivity");
  console.log("-".repeat(80));
  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test" }),
    });

    if (response.ok) {
      console.log("✅ Local orchestrator is REACHABLE at", ORCHESTRATOR_URL);
    } else {
      console.log("⚠️  Local orchestrator returned:", response.status, response.statusText);
    }
  } catch (err) {
    console.log("❌ Local orchestrator NOT reachable");
    console.log("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  console.log("");

  // Test 2: Existing capability (baseline)
  console.log("TEST 2: Existing Capability (Baseline)");
  console.log("-".repeat(80));
  console.log('Query: "highest rated hospitals"');
  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "highest rated hospitals" }),
    });

    const data = await response.json();
    if (data.success && data.data?.length > 0) {
      console.log("✅ PASS - Existing capability works");
      console.log(`   Returned ${data.data.length} rows`);
    } else {
      console.log("❌ FAIL - Existing capability broken");
      console.log("   Error:", data.error || "No data");
    }
  } catch (err) {
    console.log("❌ FAIL - Request error");
    console.log("   Error:", err instanceof Error ? err.message : String(err));
  }
  console.log("");

  // Test 3: P1-2 Safety Performance
  console.log("TEST 3: P1-2 Safety Performance (New)");
  console.log("-".repeat(80));
  console.log('Query: "hospitals with better safety outcomes"');
  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hospitals with better safety outcomes" }),
    });

    const data = await response.json();
    
    console.log("Response received:");
    console.log("  success:", data.success);
    console.log("  error:", data.error || "none");
    console.log("  data rows:", data.data?.length || 0);

    if (data.success && data.data?.length > 0) {
      console.log("");
      console.log("✅ PASS - P1-2 capability works!");
      console.log("");
      console.log("Sample data:");
      const sample = data.data[0];
      console.log("  Hospital:", sample.hospital_name);
      console.log("  Safety Score:", sample.safety_score);
      console.log("  Better Measures:", sample.safety_measures_better);
    } else if (data.error?.includes("Unable to resolve")) {
      console.log("");
      console.log("❌ DEPLOYMENT ISSUE - Semantic resolution failed");
      console.log("   This means the orchestrator hasn't loaded the new Healthcare domain pack");
      console.log("   The safety-performance metric/alias is not in the registry");
      console.log("");
      console.log("SOLUTION: Restart the local orchestrator to reload domain pack");
    } else {
      console.log("");
      console.log("❌ FAIL - Unexpected error");
      console.log("   Error:", data.error);
    }
  } catch (err) {
    console.log("❌ FAIL - Request error");
    console.log("   Error:", err instanceof Error ? err.message : String(err));
  }

  console.log("");
  console.log("=".repeat(80));
}

testLocalOrchestrator().catch(console.error);
