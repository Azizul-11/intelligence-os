/**
 * Single dimension extraction test
 * Check Supabase logs for semantic extraction
 */

const ORCHESTRATOR_URL = "http://127.0.0.1:54321/functions/v1/orchestrator";

async function testDimension() {
  const question = "highest rated hospitals in texas by county";
  
  console.log(`\nTesting: "${question}"`);
  console.log("Check Supabase logs for SEMANTIC RESULT...\n");

  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question }),
    });

    const result = await response.json();

    console.log(`Success: ${result.success}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    
    console.log("\n✅ Check Supabase logs for:");
    console.log("   - SEMANTIC RESULT");
    console.log("   - Look for 'dimensions' array");
    console.log("   - Should contain: { canonicalKey: 'county', semanticType: 'dimension' }");
    
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

testDimension();
