/**
 * Phase 7.5.1A - EntityResolutionResult contract extension verification.
 *
 * Proves the extended Universal representation can express the three
 * outcomes required by the actual repository/data evidence gathered in
 * Phase 7.5.1 - UNIQUE, AMBIGUOUS, NOT_FOUND - using domain-neutral
 * examples only. This is a pure Universal Core contract-shape check; it
 * does not touch Healthcare, hospitals, facilities, or any domain data.
 *
 * No EntityProvider implementation is exercised here - see the existing
 * Phase 4/5/6/7 regression scripts for proof that real state resolution
 * (via HealthcareEntityProvider) is unaffected by this change.
 */

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

// AMBIGUOUS with three candidates - confirms the representation is not
// hardcoded to exactly two (no "if candidates.length === 2" assumption
// anywhere in the type or this check).
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

// BACKWARD COMPATIBILITY OF SHAPE - a result using only the original
// four fields (no status, no candidates) must remain a fully valid
// EntityResolutionResult. This is exactly the shape every existing
// EntityProvider implementation already returns today.
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
