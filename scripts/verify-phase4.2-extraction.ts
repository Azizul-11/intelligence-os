/**
 * Phase 4.2 Benchmark + Relationship Extraction Verification
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);

const testQueries = [
  "above the national average",
  "below the national average",
  "above average",
  "hospitals performing above the national average",
  "California hospitals performing above the state average",
];

console.log("\n" + "=".repeat(80));
console.log("PHASE 4.2 - BENCHMARK + RELATIONSHIP EXTRACTION VERIFICATION");
console.log("=".repeat(80));

for (const query of testQueries) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Query: "${query}"`);
  console.log("=".repeat(80));
  
  const result = semantic.resolve(query);
  
  console.log(`\nResolved: ${result.resolved}`);
  
  const benchmarks = result.matches.filter(m => m.semanticType === "benchmark");
  const relationships = result.matches.filter(m => m.semanticType === "relationship");
  const metrics = result.matches.filter(m => m.semanticType === "metric");
  const entities = result.matches.filter(m => m.semanticType === "entity");
  
  console.log(`\nSemantic Matches (${result.matches.length}):`);
  
  if (metrics.length > 0) {
    console.log(`  Metrics (${metrics.length}):`);
    metrics.forEach(m => console.log(`    - ${m.phrase} → ${m.canonicalKey}`));
  }
  
  if (entities.length > 0) {
    console.log(`  Entities (${entities.length}):`);
    entities.forEach(e => console.log(`    - ${e.phrase} → ${e.canonicalKey} (resolved: ${e.resolvedValue})`));
  }
  
  if (benchmarks.length > 0) {
    console.log(`  Benchmarks (${benchmarks.length}):`);
    benchmarks.forEach(b => console.log(`    - ${b.phrase} → ${b.canonicalKey}`));
  }
  
  if (relationships.length > 0) {
    console.log(`  Relationships (${relationships.length}):`);
    relationships.forEach(r => console.log(`    - ${r.phrase} → ${r.canonicalKey}`));
  }
  
  if (benchmarks.length > 0 && relationships.length > 0) {
    console.log(`\n✅ BENCHMARK + RELATIONSHIP EXTRACTED`);
  } else if (benchmarks.length > 0) {
    console.log(`\n✅ BENCHMARK EXTRACTED (no relationship)`);
  } else if (relationships.length > 0) {
    console.log(`\n✅ RELATIONSHIP EXTRACTED (no benchmark)`);
  } else {
    console.log(`\n❌ NO BENCHMARK OR RELATIONSHIP EXTRACTED`);
  }
}

console.log("\n" + "=".repeat(80));
console.log("VERIFICATION COMPLETE");
console.log("=".repeat(80) + "\n");
