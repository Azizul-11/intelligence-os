/**
 * Verify dimension extraction by inspecting semantic resolution directly
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);

const testQueries = [
  "highest rated hospitals in texas by county",
  "show hospitals for all counties",
  "hospital count by state",
  "mortality rates by year",
  "best hospitals in california by county",
];

console.log("\n" + "=".repeat(80));
console.log("PHASE 4.1 - DIMENSION EXTRACTION VERIFICATION");
console.log("=".repeat(80));

for (const query of testQueries) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Query: "${query}"`);
  console.log("=".repeat(80));
  
  const result = semantic.resolve(query);
  
  console.log(`\nResolved: ${result.resolved}`);
  console.log(`Canonical: ${result.canonicalKey}`);
  console.log(`Type: ${result.semanticType}`);
  
  console.log(`\nSemantic Matches (${result.matches.length}):`);
  
  const metrics = result.matches.filter(m => m.semanticType === "metric");
  const entities = result.matches.filter(m => m.semanticType === "entity");
  const dimensions = result.matches.filter(m => m.semanticType === "dimension");
  
  console.log(`  Metrics (${metrics.length}):`);
  metrics.forEach(m => console.log(`    - ${m.phrase} → ${m.canonicalKey}`));
  
  console.log(`  Entities (${entities.length}):`);
  entities.forEach(e => console.log(`    - ${e.phrase} → ${e.canonicalKey} (resolved: ${e.resolvedValue})`));
  
  console.log(`  Dimensions (${dimensions.length}):`);
  dimensions.forEach(d => console.log(`    - ${d.phrase} → ${d.canonicalKey}`));
  
  if (dimensions.length > 0) {
    console.log(`\n✅ DIMENSION EXTRACTED`);
  } else {
    console.log(`\n❌ NO DIMENSION EXTRACTED`);
  }
}

console.log("\n" + "=".repeat(80));
console.log("VERIFICATION COMPLETE");
console.log("=".repeat(80) + "\n");
