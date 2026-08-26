#!/usr/bin/env -S pnpm exec tsx

/**
 * P1-2 Intent Fix Verification
 * Tests that "better" now correctly maps to ranking intent
 */

import { QueryIntentDetector } from "../packages/query-planner/src/query-intent-detector";

console.log("=".repeat(80));
console.log("P1-2 INTENT DETECTION FIX VERIFICATION");
console.log("=".repeat(80));
console.log("");

const detector = new QueryIntentDetector();

const testCases = [
  {
    query: "hospitals with better safety outcomes",
    expected: "ranking",
    reason: "Contains 'better' (P1-2 fix)",
  },
  {
    query: "safety performance ranking",
    expected: "lookup",
    reason: "No ranking keywords in query (ranking is in metric name, not query text)",
  },
  {
    query: "best hospitals for safety",
    expected: "ranking",
    reason: "Contains 'best'",
  },
  {
    query: "highest rated hospitals",
    expected: "ranking",
    reason: "Contains 'highest'",
  },
  {
    query: "show me hospitals in Texas",
    expected: "lookup",
    reason: "No ranking keywords",
  },
];

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = detector.detect(test.query);
  const pass = result === test.expected;

  if (pass) {
    console.log(`✅ PASS: "${test.query}"`);
    console.log(`   Intent: ${result} (expected: ${test.expected})`);
    console.log(`   Reason: ${test.reason}`);
    passed++;
  } else {
    console.log(`❌ FAIL: "${test.query}"`);
    console.log(`   Intent: ${result} (expected: ${test.expected})`);
    console.log(`   Reason: ${test.reason}`);
    failed++;
  }
  console.log("");
}

console.log("=".repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(80));

if (failed > 0) {
  process.exit(1);
}
