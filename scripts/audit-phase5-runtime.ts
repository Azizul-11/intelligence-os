/**
 * Phase 5 Pre-Commit Audit - Runtime Verification
 * 
 * Test Phase 5 ExecutionPlan across multiple query patterns
 */

const ORCHESTRATOR_URL = "http://127.0.0.1:54321/functions/v1/orchestrator";

interface TestQuery {
  id: string;
  question: string;
  expectedOperation: string;
  expectedMetric: string;
}

const AUDIT_QUERIES: TestQuery[] = [
  {
    id: "Q1",
    question: "highest rated hospitals",
    expectedOperation: "rank",
    expectedMetric: "hospital-overall-rating",
  },
  {
    id: "Q2",
    question: "hospitals in California",
    expectedOperation: "lookup",
    expectedMetric: "hospital-list",
  },
  {
    id: "Q3",
    question: "how many hospitals are in California",
    expectedOperation: "aggregate",
    expectedMetric: "hospital-count",
  },
  {
    id: "Q4",
    question: "highest rated hospitals in California",
    expectedOperation: "rank",
    expectedMetric: "hospital-overall-rating",
  },
];

async function testQuery(query: TestQuery): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log(`${query.id}: "${query.question}"`);
  console.log("=".repeat(80));

  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query.question }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`✅ SUCCESS`);
      console.log(`Rows: ${result.rowCount}`);
    } else {
      console.log(`❌ FAILED: ${result.error}`);
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runAudit(): Promise<void> {
  console.log("=".repeat(80));
  console.log("PHASE 5 PRE-COMMIT AUDIT - RUNTIME VERIFICATION");
  console.log("=".repeat(80));

  for (const query of AUDIT_QUERIES) {
    await testQuery(query);
  }

  console.log("\n" + "=".repeat(80));
  console.log("AUDIT COMPLETE");
  console.log("=".repeat(80));
}

runAudit().catch(console.error);
