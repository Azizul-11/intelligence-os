/**
 * Phase 4.3 Category Semantic Extraction Verification
 *
 * Tests category alias resolution using the Healthcare Domain SDK.
 * NO SQL execution - semantic extraction only.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);

interface TestCase {
  id: string;
  query: string;
  expectedCategory: string;
  description: string;
}

const testCases: TestCase[] = [
  {
    id: "CAT-1",
    query: "best hospitals for quality",
    expectedCategory: "quality",
    description: "Quality category extraction",
  },
  {
    id: "CAT-2",
    query: "hospitals with strong safety performance",
    expectedCategory: "safety",
    description: "Safety category extraction",
  },
  {
    id: "CAT-3",
    query: "hospital operations by state",
    expectedCategory: "operations",
    description: "Operations category extraction",
  },
  {
    id: "CAT-4",
    query: "patient experience by county",
    expectedCategory: "experience",
    description: "Experience category extraction",
  },
  {
    id: "CAT-5",
    query: "clinical outcomes in Texas",
    expectedCategory: "clinical-outcomes",
    description: "Clinical outcomes category extraction",
  },
];

console.log("\n" + "=".repeat(80));
console.log("PHASE 4.3: CATEGORY SEMANTIC EXTRACTION VERIFICATION");
console.log("=".repeat(80));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[${testCase.id}] ${testCase.description}`);
  console.log(`Query: "${testCase.query}"`);
  console.log("=".repeat(80));

  const result = semantic.resolve(testCase.query);

  console.log(`\nResolved: ${result.resolved}`);

  const categories = result.matches.filter(m => m.semanticType === "category");
  const dimensions = result.matches.filter(m => m.semanticType === "dimension");
  const entities = result.matches.filter(m => m.semanticType === "entity");

  console.log(`\nSemantic Matches (${result.matches.length}):`);

  if (categories.length > 0) {
    console.log(`  Categories (${categories.length}):`);
    categories.forEach(c => console.log(`    - ${c.phrase} → ${c.canonicalKey}`));
  }

  if (dimensions.length > 0) {
    console.log(`  Dimensions (${dimensions.length}):`);
    dimensions.forEach(d => console.log(`    - ${d.phrase} → ${d.canonicalKey}`));
  }

  if (entities.length > 0) {
    console.log(`  Entities (${entities.length}):`);
    entities.forEach(e => console.log(`    - ${e.phrase} → ${e.canonicalKey} (resolved: ${e.resolvedValue})`));
  }

  // Verify expected category was extracted
  const extractedCategories = categories.map(c => c.canonicalKey);
  const success = extractedCategories.includes(testCase.expectedCategory);

  if (success) {
    console.log(`\n✅ PASS - Category "${testCase.expectedCategory}" extracted`);
    passed++;
  } else {
    console.log(`\n❌ FAIL - Expected category "${testCase.expectedCategory}" not found`);
    console.log(`   Extracted categories: ${extractedCategories.length > 0 ? extractedCategories.join(", ") : "none"}`);
    failed++;
  }
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 4.3 CATEGORY EXTRACTION RESULTS");
console.log("=".repeat(80));
console.log(`Total: ${testCases.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log();

if (failed === 0) {
  console.log("✅ PHASE 4.3 CATEGORY EXTRACTION: ALL TESTS PASSED");
  process.exit(0);
} else {
  console.log("❌ PHASE 4.3 CATEGORY EXTRACTION: TESTS FAILED");
  process.exit(1);
}
