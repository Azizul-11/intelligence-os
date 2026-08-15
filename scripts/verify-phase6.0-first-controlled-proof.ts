/**
 * Phase 6.0 - First Controlled Proof
 *
 * Determines, empirically, whether the CURRENT (unmodified) semantic
 * pipeline already produces >= 2 metric candidates for a compound
 * multi-metric question, and records exact candidate data (phrase,
 * canonicalKey, confidence, start/end) so the Phase 6 implementation
 * decisions can be based on observed behavior, not assumption.
 *
 * This script does not modify any package source. It only observes.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);

const testQueries = [
  "Which hospitals have the best ratings and lowest mortality?",
  "Which hospitals in Texas have the best ratings and lowest mortality?",
  // Adjusted phrasing (per review decision: defer alias-data gaps, adjust test wording)
  "Which hospitals have the best overall rating and lowest mortality?",
  "Which hospitals have the lowest mortality and best overall rating?",
  "Which hospitals located in Texas have the best overall rating and lowest mortality?",
  "Which hospitals have the best overall rating, lowest mortality, and lowest readmission?",
  // Graceful-fallback check: this query resolves via LexicalRewriter's
  // existing hardcoded regex substitution ("highest rated hospitals" ->
  // "hospital overall rating"), so the candidate's phrase never literally
  // appears in the ORIGINAL tokens. The direction resolver should find no
  // match and leave direction undefined (not crash, not guess wrong).
  "highest rated hospitals",
];

function describe(candidate: any) {
  return {
    phrase: candidate.phrase,
    canonicalKey: candidate.canonicalKey,
    semanticType: candidate.semanticType,
    confidence: candidate.confidence,
    start: candidate.start,
    end: candidate.end,
    resolvedValue: candidate.resolvedValue,
    direction: candidate.direction,
  };
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 6.0 - FIRST CONTROLLED PROOF");
console.log("=".repeat(80));

for (const query of testQueries) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Query: "${query}"`);
  console.log("=".repeat(80));

  const result = semantic.resolve(query);

  const metrics = result.matches.filter((m) => m.semanticType === "metric");
  const entities = result.matches.filter((m) => m.semanticType === "entity");
  const relationships = result.matches.filter((m) => m.semanticType === "relationship");
  const dimensions = result.matches.filter((m) => m.semanticType === "dimension");

  console.log(`\nTotal matches: ${result.matches.length}`);
  console.log(`\nMETRIC candidates (${metrics.length}):`);
  metrics.forEach((m) => console.log(JSON.stringify(describe(m))));

  console.log(`\nENTITY candidates (${entities.length}):`);
  entities.forEach((e) => console.log(JSON.stringify(describe(e))));

  console.log(`\nRELATIONSHIP candidates (${relationships.length}):`);
  relationships.forEach((r) => console.log(JSON.stringify(describe(r))));

  console.log(`\nDIMENSION candidates (${dimensions.length}):`);
  dimensions.forEach((d) => console.log(JSON.stringify(describe(d))));

  const distinctMetricKeys = new Set(metrics.map((m) => m.canonicalKey));

  console.log(`\nDistinct metric canonicalKeys: ${[...distinctMetricKeys].join(", ") || "(none)"}`);
  console.log(
    metrics.length >= 2
      ? "\n>= 2 metric candidates: YES"
      : "\n>= 2 metric candidates: NO",
  );
}

console.log("\n" + "=".repeat(80));
console.log("PROOF COMPLETE");
console.log("=".repeat(80) + "\n");
