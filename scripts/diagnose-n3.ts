/**
 * Diagnose N3 Query Failure
 * 
 * Query: "hospitals with best patient satisfaction"
 * Issue: "Unable to create query plan."
 * 
 * Trace the complete semantic → QueryPlan path.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { QueryPlanner } from "../packages/query-planner/src/index";

const QUERY = "hospitals with best patient satisfaction";

console.log("=".repeat(80));
console.log("N3 DIAGNOSIS");
console.log("=".repeat(80));
console.log(`Query: "${QUERY}"`);
console.log();

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();

// Step 1: Semantic Resolution
console.log("STEP 1: SEMANTIC RESOLUTION");
console.log("=".repeat(80));
const semanticResult = semantic.resolve(QUERY);

console.log(`Resolved: ${semanticResult.resolved}`);
console.log(`Canonical Key: ${semanticResult.canonicalKey}`);
console.log(`Semantic Type: ${semanticResult.semanticType}`);
console.log(`\nMatches (${semanticResult.matches.length}):`);

for (const match of semanticResult.matches) {
  console.log(`  - ${match.semanticType}: ${match.phrase} → ${match.canonicalKey}`);
}

// Step 2: Query Planning
console.log("\n" + "=".repeat(80));
console.log("STEP 2: QUERY PLANNING");
console.log("=".repeat(80));

const planResult = planner.createPlan(semanticResult);

console.log(`Success: ${planResult.success}`);

if (planResult.success && planResult.plan) {
  console.log("\nQueryPlan Created:");
  console.log(`  Intent: ${planResult.plan.intent}`);
  console.log(`  Metrics: ${planResult.plan.semantic.metrics.length}`);
  for (const metric of planResult.plan.semantic.metrics) {
    console.log(`    - ${metric.canonicalKey}`);
  }
  console.log(`  Entities: ${planResult.plan.semantic.entities.length}`);
  console.log(`  Dimensions: ${planResult.plan.semantic.dimensions.length}`);
  console.log(`  Categories: ${planResult.plan.semantic.categories.length}`);
  for (const cat of planResult.plan.semantic.categories) {
    console.log(`    - ${cat.canonicalKey}`);
  }
} else {
  console.log("\n❌ QueryPlan Creation FAILED");
  console.log("\nDiagnosing...");
  
  // Check why it failed
  if (!semanticResult.resolved) {
    console.log("  Issue: Semantic resolution failed");
  } else if (semanticResult.matches.length === 0) {
    console.log("  Issue: No semantic matches found");
  } else {
    // Check metrics
    const metrics = semanticResult.matches.filter(m => m.semanticType === "metric");
    const categories = semanticResult.matches.filter(m => m.semanticType === "category");
    
    console.log(`  Metrics found: ${metrics.length}`);
    console.log(`  Categories found: ${categories.length}`);
    
    if (metrics.length === 0) {
      console.log("\n  ROOT CAUSE: No metrics extracted");
      console.log("  QueryPlanner requires at least one metric");
      console.log("\n  Categories are NOT metrics:");
      for (const cat of categories) {
        console.log(`    - ${cat.canonicalKey} (type: ${cat.semanticType})`);
      }
      
      console.log("\n  ANALYSIS:");
      console.log("  - 'patient satisfaction' resolves to 'experience' category");
      console.log("  - Categories cannot directly execute queries");
      console.log("  - Need a metric like 'patient-experience' (the actual metric)");
      console.log("  - This is NOT a Phase 5 issue");
      console.log("  - This is a semantic alias configuration issue");
    }
  }
}

console.log("\n" + "=".repeat(80));
console.log("DIAGNOSIS COMPLETE");
console.log("=".repeat(80));
