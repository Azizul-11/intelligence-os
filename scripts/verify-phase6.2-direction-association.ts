/**
 * Phase 6.2 - Generic Direction Association Verification
 *
 * Verifies ModifierDirectionResolver correctly associates superlative
 * modifiers (best/lowest/highest/...) with the nearest metric candidate,
 * across multiple compound-query forms; that a rewrite-derived
 * (fallback) candidate still recovers its direction via RCG-020's
 * pattern-text classification rather than being left undefined; and
 * that non-metric candidates (relationships/benchmarks) never receive a
 * direction field at all.
 *
 * NO SQL execution - semantic extraction only.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);

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

function metricDirection(matches: any[], canonicalKey: string): string | undefined {
  return matches.find((m) => m.semanticType === "metric" && m.canonicalKey === canonicalKey)?.direction;
}

// D1 - Forward order: "best overall rating and lowest mortality"
{
  const result = semantic.resolve("Which hospitals have the best overall rating and lowest mortality?");
  const rating = metricDirection(result.matches, "hospital-overall-rating");
  const mortality = metricDirection(result.matches, "mortality-rate");
  const pass = rating === "desc" && mortality === "asc";
  check("D1", "Forward order: rating=desc, mortality=asc", pass, `rating=${rating}, mortality=${mortality}`);
}

// D2 - Reverse order: "lowest mortality and best overall rating"
{
  const result = semantic.resolve("Which hospitals have the lowest mortality and best overall rating?");
  const rating = metricDirection(result.matches, "hospital-overall-rating");
  const mortality = metricDirection(result.matches, "mortality-rate");
  const pass = rating === "desc" && mortality === "asc";
  check("D2", "Reverse order still correct (order-independent): rating=desc, mortality=asc", pass, `rating=${rating}, mortality=${mortality}`);
}

// D3 - Three metrics, includes an equidistant tie case ("overall rating" sits
// exactly 1 token from "best" on its left and 1 token from "lowest" on its right)
{
  const result = semantic.resolve(
    "Which hospitals have the best overall rating, lowest mortality, and lowest readmission?",
  );
  const rating = metricDirection(result.matches, "hospital-overall-rating");
  const mortality = metricDirection(result.matches, "mortality-rate");
  const readmission = metricDirection(result.matches, "readmission-rate");
  const pass = rating === "desc" && mortality === "asc" && readmission === "asc";
  check(
    "D3",
    "Three metrics, tie-break-toward-preceding resolves correctly",
    pass,
    `rating=${rating}, mortality=${mortality}, readmission=${readmission}`,
  );
}

// D4 - State filter coexists with correct directions
{
  const result = semantic.resolve(
    "Which hospitals located in Texas have the best overall rating and lowest mortality?",
  );
  const rating = metricDirection(result.matches, "hospital-overall-rating");
  const mortality = metricDirection(result.matches, "mortality-rate");
  const stateEntity = result.matches.find((m) => m.semanticType === "entity" && m.canonicalKey === "state");
  const pass = rating === "desc" && mortality === "asc" && stateEntity?.resolvedValue === "TX";
  check(
    "D4",
    "State filter + directions coexist correctly, filter mechanism untouched",
    pass,
    `rating=${rating}, mortality=${mortality}, state=${stateEntity?.resolvedValue}`,
  );
}

// D5 - RCG-020: a candidate produced via LexicalRewriter's rewrite path
// never literally appears in the original tokens, so the ordinary
// span-based association above can never find it there. Before RCG-020
// this meant direction stayed undefined for every such candidate
// (asserted here originally as the then-correct "graceful fallback").
// RCG-020 recovers direction instead from whether the fired rule's own
// trigger phrase ("highest rated hospitals") embeds a recognized
// modifier - it does ("highest") - so direction must now be "desc" for
// every metric candidate this rewrite produces, not undefined.
{
  const result = semantic.resolve("highest rated hospitals");
  const metrics = result.matches.filter((m) => m.semanticType === "metric");
  const pass = metrics.length > 0 && metrics.every((m) => m.direction === "desc");
  check(
    "D5",
    "RCG-020: rewrite-path candidate recovers direction from the fired rule's own pattern text",
    pass,
    `metrics=${JSON.stringify(metrics.map((m) => ({ phrase: m.phrase, direction: m.direction })))}`,
  );
}

// D6 - Existing above/below-comparison relationship mechanism untouched;
// non-metric candidates never receive a direction field.
{
  const result = semantic.resolve("hospitals above the national average in california");
  const relationships = result.matches.filter((m) => m.semanticType === "relationship");
  const benchmarks = result.matches.filter((m) => m.semanticType === "benchmark");
  const pass =
    relationships.some((r) => r.canonicalKey === "above-comparison") &&
    benchmarks.length > 0 &&
    result.matches.every((m) => m.semanticType === "metric" || m.direction === undefined);
  check(
    "D6",
    "Existing above-comparison relationship signal untouched; direction only ever set on metric candidates",
    pass,
    `relationships=${JSON.stringify(relationships.map((r) => r.canonicalKey))}, anyNonMetricDirection=${result.matches.some((m) => m.semanticType !== "metric" && m.direction !== undefined)}`,
  );
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 6.2 DIRECTION ASSOCIATION VERIFICATION");
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
  console.log("\n❌ PHASE 6.2 DIRECTION ASSOCIATION VERIFICATION: FAILED");
  process.exit(1);
} else {
  console.log("\n✅ PHASE 6.2 DIRECTION ASSOCIATION VERIFICATION: ALL TESTS PASSED");
}
