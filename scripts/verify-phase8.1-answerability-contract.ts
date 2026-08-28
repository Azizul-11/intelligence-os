/**
 * Phase 8.1 - Minimal Validation / Answerability Contract Verification
 *
 * Verifies, at the semantic-resolution layer (no SQL execution):
 * - a genuinely ambiguous entity mention (a real duplicate hospital name)
 *   is now preserved as SemanticResolutionResult.identityAmbiguities,
 *   distinct from a phrase that was never understood at all;
 * - an explicit qualifier ("<name> in <state>") still resolves the same
 *   ambiguous name to exactly one canonical identity, unaffected;
 * - existing regression behavior (RCG-010 direction contradiction, F5
 *   negation gate, ordinary single-metric resolution) is unchanged.
 *
 * NO SQL execution - semantic extraction only. Live runtime/SQL-safety
 * evidence is captured separately (see PHASE_8_1_IMPLEMENTATION_REPORT.md).
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

// A1 - Duplicate/same-name entity: "Greene County Hospital" is a real,
// confirmed duplicate in the CMS data (Alabama + Mississippi facilities).
// Must NOT silently disappear - must surface as identityAmbiguities with
// both candidate facility_ids, and must NOT produce a "hospital" candidate.
{
  const result = semantic.resolve("Greene County Hospital overall rating");
  const ambiguities = result.identityAmbiguities ?? [];
  const hospitalCandidate = result.matches.find(
    (m) => m.semanticType === "entity" && m.canonicalKey === "hospital",
  );
  const pass =
    ambiguities.length === 1 &&
    ambiguities[0]!.status === "ambiguous" &&
    Array.isArray(ambiguities[0]!.candidates) &&
    ambiguities[0]!.candidates!.length >= 2 &&
    hospitalCandidate === undefined;
  check(
    "A1",
    "Duplicate name entity surfaces as identityAmbiguities, not silently dropped",
    pass,
    `identityAmbiguities=${JSON.stringify(ambiguities)}, hospitalCandidateFound=${!!hospitalCandidate}`,
  );
}

// A2 - Qualified duplicate name: "Greene County Hospital in Alabama" must
// still resolve to exactly one canonical identity - explicit qualifiers
// must not trigger unnecessary ambiguity.
{
  const result = semantic.resolve("Greene County Hospital in Alabama overall rating");
  const ambiguities = result.identityAmbiguities ?? [];
  const hospitalCandidate = result.matches.find(
    (m) => m.semanticType === "entity" && m.canonicalKey === "hospital",
  );
  const pass = ambiguities.length === 0 && hospitalCandidate !== undefined;
  check(
    "A2",
    "Qualified duplicate name resolves uniquely - no identityAmbiguities",
    pass,
    `identityAmbiguities=${JSON.stringify(ambiguities)}, hospitalCandidate=${JSON.stringify(hospitalCandidate)}`,
  );
}

// A3 - Regression: ordinary single-metric query still resolves cleanly,
// with no identityAmbiguities.
{
  const result = semantic.resolve("highest rated hospitals");
  const pass = result.resolved && !result.identityAmbiguities;
  check(
    "A3",
    "Regression: ordinary query unaffected (no identityAmbiguities)",
    pass,
    `resolved=${result.resolved}, identityAmbiguities=${JSON.stringify(result.identityAmbiguities)}`,
  );
}

// A4 - Regression: RCG-010 direction contradiction still produces
// ambiguityError, unaffected by the new field.
{
  const result = semantic.resolve("hospitals with the best and worst overall rating");
  const pass = typeof result.ambiguityError === "string" && !result.identityAmbiguities;
  check(
    "A4",
    "Regression: RCG-010 direction contradiction unaffected",
    pass,
    `ambiguityError=${result.ambiguityError}, identityAmbiguities=${JSON.stringify(result.identityAmbiguities)}`,
  );
}

// A5 - Regression: F5 negation gate still detected, unaffected by the new
// field.
{
  const result = semantic.resolve("best hospitals excluding Texas");
  const pass = result.unsupportedNegation === true && !result.identityAmbiguities;
  check(
    "A5",
    "Regression: F5 negation gate unaffected",
    pass,
    `unsupportedNegation=${result.unsupportedNegation}, identityAmbiguities=${JSON.stringify(result.identityAmbiguities)}`,
  );
}

// A6 - Not-found phrase (genuinely unrecognized, not ambiguous) does not
// populate identityAmbiguities - confirms the two states remain distinct.
{
  const result = semantic.resolve("best hospitals for zzznotarealmetriczzz");
  const pass = !result.identityAmbiguities;
  check(
    "A6",
    "Genuinely unrecognized phrase does not populate identityAmbiguities",
    pass,
    `identityAmbiguities=${JSON.stringify(result.identityAmbiguities)}`,
  );
}

console.log("=".repeat(80));
console.log("PHASE 8.1 - ANSWERABILITY CONTRACT VERIFICATION");
console.log("=".repeat(80));

let allPass = true;

for (const r of results) {
  const status = r.pass ? "PASS" : "FAIL";
  if (!r.pass) allPass = false;
  console.log(`[${status}] ${r.id} - ${r.description}`);
  console.log(`       ${r.detail}`);
}

console.log("=".repeat(80));
console.log(
  allPass
    ? `ALL ${results.length} CHECKS PASSED`
    : `FAILURES PRESENT (${results.filter((r) => !r.pass).length}/${results.length})`,
);

if (!allPass) {
  process.exit(1);
}
