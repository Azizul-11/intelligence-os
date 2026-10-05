/** Phase 7.5.1A: pure Universal Core contract-shape check that EntityResolutionResult can express UNIQUE, AMBIGUOUS and NOT_FOUND with domain-neutral examples; no EntityProvider is exercised. */

import type { EntityResolutionResult } from "../packages/domain-sdk/src/runtime/entity-resolution-result";

interface Result {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

const results: Result[] = [];

function check(id: string, description: string, pass: boolean, detail: string) {
  results.push({ id, description, pass, detail });
}

// UNIQUE - exactly one canonical identity
{
  const result: EntityResolutionResult = {
    found: true,
    entityId: "entity",
    value: "A",
    phrase: "mention",
    status: "unique",
  };

  const pass =
    result.found === true &&
    result.status === "unique" &&
    result.value === "A" &&
    result.candidates === undefined;

  check(
    "UNIQUE",
    "Unique resolution: exactly one canonical identity, no candidate set",
    pass,
    JSON.stringify(result),
  );
}

// AMBIGUOUS - multiple candidate identities, none silently chosen
{
  const result: EntityResolutionResult = {
    found: false,
    entityId: "entity",
    value: null,
    phrase: "mention",
    status: "ambiguous",
    candidates: ["A", "B"],
  };

  const pass =
    result.found === false &&
    result.status === "ambiguous" &&
    Array.isArray(result.candidates) &&
    result.candidates.length === 2 &&
    result.candidates.includes("A") &&
    result.candidates.includes("B") &&
    result.value === null;

  check(
    "AMBIGUOUS",
    "Ambiguous resolution: multiple candidates preserved, none silently collapsed to a single value",
    pass,
    JSON.stringify(result),
  );
}

// AMBIGUOUS with three candidates: the representation must not assume exactly two.
{
  const result: EntityResolutionResult = {
    found: false,
    entityId: "entity",
    value: null,
    phrase: "mention",
    status: "ambiguous",
    candidates: ["A", "B", "C"],
  };

  const pass =
    result.status === "ambiguous" &&
    Array.isArray(result.candidates) &&
    result.candidates.length === 3;

  check(
    "AMBIGUOUS_N",
    "Ambiguous resolution generalizes beyond two candidates",
    pass,
    JSON.stringify(result),
  );
}

// NOT_FOUND - no identity at all
{
  const result: EntityResolutionResult = {
    found: false,
    entityId: null,
    value: null,
    phrase: null,
    status: "not_found",
  };

  const pass =
    result.found === false &&
    result.status === "not_found" &&
    result.candidates === undefined &&
    result.value === null;

  check(
    "NOT_FOUND",
    "Not-found resolution: no identity, no candidate set",
    pass,
    JSON.stringify(result),
  );
}

// Backward compatibility: a result with only the original four fields (no status, no candidates) must stay valid.
{
  const legacyShapedResult: EntityResolutionResult = {
    found: true,
    entityId: "entity",
    value: "X",
    phrase: "mention",
  };

  const pass =
    legacyShapedResult.found === true &&
    legacyShapedResult.status === undefined &&
    legacyShapedResult.candidates === undefined;

  check(
    "LEGACY_SHAPE",
    "Original four-field result shape remains valid with no forced changes to existing EntityProvider implementations",
    pass,
    JSON.stringify(legacyShapedResult),
  );
}

console.log("\n" + "=".repeat(80));
console.log("ENTITY RESOLUTION RESULT CONTRACT VERIFICATION (Phase 7.5.1A)");
console.log("=".repeat(80));

for (const r of results) {
  console.log(`\n[${r.id}] ${r.description}`);
  console.log(`  ${r.detail}`);
  console.log(r.pass ? "  ✅ PASS" : "  ❌ FAIL");
}

const total = results.length;
const passed = results.filter((r) => r.pass).length;

console.log("\n" + "=".repeat(80));
console.log(`Total: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${total - passed}`);
console.log("=".repeat(80));

if (passed !== total) {
  console.log("\n❌ ENTITY RESOLUTION RESULT CONTRACT VERIFICATION: FAILED");
  process.exit(1);
} else {
  console.log("\n✅ ENTITY RESOLUTION RESULT CONTRACT VERIFICATION: ALL TESTS PASSED");
}
