/**
 * Phase 6.1 - Semantic Position Verification
 *
 * Verifies that SemanticCandidate.start/end now reflect real originating
 * phrase positions (previously hardcoded to 0/0), and that existing
 * single-metric resolution behavior is unchanged.
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

// TEST P1 - Existing single-metric query still resolves correctly (regression)
{
  const result = semantic.resolve("highest rated hospitals in texas by county");
  const metrics = result.matches.filter((m) => m.semanticType === "metric");
  const entities = result.matches.filter((m) => m.semanticType === "entity");
  const dimensions = result.matches.filter((m) => m.semanticType === "dimension");

  const pass =
    result.resolved === true &&
    metrics.length >= 1 &&
    metrics.every((m) => m.canonicalKey === "hospital-overall-rating") &&
    entities.some((e) => e.canonicalKey === "state" && e.resolvedValue === "TX") &&
    dimensions.some((d) => d.canonicalKey === "county-dimension");

  check(
    "P1",
    "Existing single-metric query resolves identically to pre-Phase-6.1 behavior",
    pass,
    `resolved=${result.resolved}, metrics=${JSON.stringify(metrics.map((m) => m.canonicalKey))}, entities=${JSON.stringify(entities.map((e) => [e.canonicalKey, e.resolvedValue]))}, dimensions=${JSON.stringify(dimensions.map((d) => d.canonicalKey))}`,
  );
}

// TEST P2 - Candidate positions are no longer hardcoded 0/0
{
  const result = semantic.resolve("Which hospitals have the best overall rating and lowest mortality?");
  const metrics = result.matches.filter((m) => m.semanticType === "metric");

  const rating = metrics.find((m) => m.canonicalKey === "hospital-overall-rating");
  const mortality = metrics.find((m) => m.canonicalKey === "mortality-rate");

  const pass =
    !!rating &&
    !!mortality &&
    // "overall rating" is a 2-token phrase - end must be start+1, not 0/0
    rating.end === rating.start + 1 &&
    rating.start > 0 &&
    // "mortality" is a 1-token phrase - start === end, but not both 0
    mortality.start === mortality.end &&
    mortality.start > 0;

  check(
    "P2",
    "Candidate start/end reflect real token positions, not hardcoded 0/0",
    pass,
    `rating=${JSON.stringify(rating && { start: rating.start, end: rating.end })}, mortality=${JSON.stringify(mortality && { start: mortality.start, end: mortality.end })}`,
  );
}

// TEST P3 - Position ordering reflects original phrase order (foundation for Phase 6.2)
{
  const forward = semantic.resolve("Which hospitals have the best overall rating and lowest mortality?");
  const reverse = semantic.resolve("Which hospitals have the lowest mortality and best overall rating?");

  const forwardMetrics = forward.matches.filter((m) => m.semanticType === "metric");
  const reverseMetrics = reverse.matches.filter((m) => m.semanticType === "metric");

  const forwardRating = forwardMetrics.find((m) => m.canonicalKey === "hospital-overall-rating");
  const forwardMortality = forwardMetrics.find((m) => m.canonicalKey === "mortality-rate");

  const reverseRating = reverseMetrics.find((m) => m.canonicalKey === "hospital-overall-rating");
  const reverseMortality = reverseMetrics.find((m) => m.canonicalKey === "mortality-rate");

  const pass =
    !!forwardRating &&
    !!forwardMortality &&
    !!reverseRating &&
    !!reverseMortality &&
    // forward: "rating" appears before "mortality" in the sentence
    forwardRating.start < forwardMortality.start &&
    // reverse: "mortality" appears before "rating" in the sentence
    reverseMortality.start < reverseRating.start;

  check(
    "P3",
    "Position ordering tracks actual sentence order, both directions",
    pass,
    `forward rating.start=${forwardRating?.start} mortality.start=${forwardMortality?.start}; reverse mortality.start=${reverseMortality?.start} rating.start=${reverseRating?.start}`,
  );
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 6.1 SEMANTIC POSITION VERIFICATION");
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
  console.log("\n❌ PHASE 6.1 SEMANTIC POSITION VERIFICATION: FAILED");
  process.exit(1);
} else {
  console.log("\n✅ PHASE 6.1 SEMANTIC POSITION VERIFICATION: ALL TESTS PASSED");
}
