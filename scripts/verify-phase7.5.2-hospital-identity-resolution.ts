/**
 * Phase 7.5.2 - Domain Entity Identity Resolution Verification
 *
 * Proves that the Healthcare Domain SDK can resolve a named hospital to
 * its canonical deterministic facility_id, honestly representing
 * ambiguity when a name maps to more than one real facility, and
 * narrowing via explicit qualifiers (state/city) only when the real
 * data justifies exactly one remaining candidate.
 *
 * Every example below is a REAL entry from the generated hospital
 * identity directory (domain-packs/healthcare/src/runtime/
 * hospital-identity-directory.ts, itself generated from the real CMS
 * source data) - nothing is invented or hand-picked as a demo fixture.
 *
 * Tests the Healthcare EntityProvider directly (not the full NL
 * semantic pipeline) - this is a domain-resolution capability proof,
 * not a comparison or multi-entity execution proof (those are later,
 * separately-scoped tasks).
 */

import { HealthcareEntityProvider } from "../domain-packs/healthcare/src/runtime/entity-provider";

const provider = new HealthcareEntityProvider();

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

// CASE 1 - UNIQUE: a real hospital name with exactly one facility.
{
  const result = provider.resolve("Mayo Clinic");

  const pass =
    result.found === true &&
    result.status === "unique" &&
    result.value === "100151" &&
    result.candidates === undefined;

  check(
    "CASE 1 - UNIQUE",
    '"Mayo Clinic" -> exactly one real facility (100151, Jacksonville FL)',
    pass,
    JSON.stringify(result),
  );
}

// CASE 2 - AMBIGUOUS: a real duplicate hospital name (2 real facilities,
// different states). Must NOT silently pick one.
{
  const result = provider.resolve("Greene County Hospital");

  const pass =
    result.found === false &&
    result.status === "ambiguous" &&
    Array.isArray(result.candidates) &&
    result.candidates.length === 2 &&
    result.candidates.includes("010051") && // AL, Eutaw
    result.candidates.includes("250782") && // MS, Leakesville
    result.value === null;

  check(
    "CASE 2 - AMBIGUOUS",
    '"Greene County Hospital" -> 2 real facilities (AL + MS) - must not guess',
    pass,
    JSON.stringify(result),
  );
}

// CASE 3 - QUALIFIER DISAMBIGUATION: same ambiguous name, qualifier
// narrows to exactly one real facility (state name).
{
  const result = provider.resolveHospitalByQualifier("Greene County Hospital", "Alabama");

  const pass =
    result.found === true &&
    result.status === "unique" &&
    result.value === "010051";

  check(
    "CASE 3 - QUALIFIER (state name)",
    '"Greene County Hospital" + "Alabama" -> narrows to exactly one facility (010051)',
    pass,
    JSON.stringify(result),
  );
}

// CASE 3b - QUALIFIER DISAMBIGUATION using a state abbreviation instead
// of the full name, and the OTHER candidate, proving both directions.
{
  const result = provider.resolveHospitalByQualifier("Greene County Hospital", "MS");

  const pass =
    result.found === true &&
    result.status === "unique" &&
    result.value === "250782";

  check(
    "CASE 3b - QUALIFIER (state abbreviation)",
    '"Greene County Hospital" + "MS" -> narrows to exactly one facility (250782)',
    pass,
    JSON.stringify(result),
  );
}

// CASE 3c - QUALIFIER DISAMBIGUATION using a city, on a larger real
// duplicate-name group (12 real facilities named "Memorial Hospital").
{
  const result = provider.resolveHospitalByQualifier("Memorial Hospital", "Gonzales");

  const pass =
    result.found === true &&
    result.status === "unique" &&
    result.value === "450235"; // TX, Gonzales - the only Memorial Hospital in Gonzales

  check(
    "CASE 3c - QUALIFIER (city, larger group)",
    '"Memorial Hospital" + "Gonzales" -> narrows 12 real candidates down to exactly one (450235)',
    pass,
    JSON.stringify(result),
  );
}

// CASE 4 - STILL AMBIGUOUS AFTER QUALIFIER: "Memorial Hospital" has 3
// real facilities in Texas alone (Gonzales, Seminole, Dumas) - a state
// qualifier does not uniquely identify one. Must remain ambiguous, not
// guess.
{
  const result = provider.resolveHospitalByQualifier("Memorial Hospital", "Texas");

  const pass =
    result.found === false &&
    result.status === "ambiguous" &&
    Array.isArray(result.candidates) &&
    result.candidates.length === 3 &&
    result.candidates.includes("450235") &&
    result.candidates.includes("451358") &&
    result.candidates.includes("451386");

  check(
    "CASE 4 - STILL AMBIGUOUS AFTER QUALIFIER",
    '"Memorial Hospital" + "Texas" -> 3 real Texas facilities remain, state qualifier insufficient - must not guess',
    pass,
    JSON.stringify(result),
  );
}

// CASE 5 - NOT FOUND: a deliberately nonexistent phrase.
{
  const result = provider.resolve("Definitely Not A Real Hospital Name Xyzzy");

  const pass =
    result.found === false &&
    result.status === "not_found" &&
    result.value === null &&
    result.candidates === undefined;

  check(
    "CASE 5 - NOT FOUND",
    "Nonexistent phrase -> not_found, no fabricated identity",
    pass,
    JSON.stringify(result),
  );
}

// CASE 6 - LEGACY STATE RESOLUTION REGRESSION: existing state resolution
// must remain byte-for-byte unchanged.
{
  const texas = provider.resolve("Texas");
  const california = provider.resolve("California");

  const pass =
    texas.found === true &&
    texas.entityId === "state" &&
    texas.value === "TX" &&
    texas.status === undefined && // unchanged legacy shape, no new fields populated
    texas.candidates === undefined &&
    california.found === true &&
    california.entityId === "state" &&
    california.value === "CA" &&
    california.status === undefined;

  check(
    "CASE 6 - LEGACY REGRESSION",
    '"Texas" -> TX and "California" -> CA, exactly as before, no new fields populated',
    pass,
    `texas=${JSON.stringify(texas)}, california=${JSON.stringify(california)}`,
  );
}

// EXTRA - a known residual-ambiguity case discovered during
// investigation: "Wiregrass Medical Center" has 2 real facilities that
// share BOTH the same state AND the same city (AL, Geneva) - no
// state/city qualifier can disambiguate this one. This is reported as
// an architectural observation, not something this task attempts to
// solve; the assertion here only confirms the system honestly reports
// ambiguity rather than fabricating a distinction that does not exist.
{
  const bare = provider.resolve("Wiregrass Medical Center");
  const qualified = provider.resolveHospitalByQualifier("Wiregrass Medical Center", "Alabama");

  const pass =
    bare.status === "ambiguous" &&
    Array.isArray(bare.candidates) &&
    bare.candidates.length === 2 &&
    qualified.status === "ambiguous" &&
    Array.isArray(qualified.candidates) &&
    qualified.candidates.length === 2; // state qualifier does not help - both are AL

  check(
    "EXTRA - residual ambiguity (same state AND city)",
    '"Wiregrass Medical Center" has 2 real facilities sharing state+city - correctly remains ambiguous even after a state qualifier',
    pass,
    `bare=${JSON.stringify(bare)}, qualified=${JSON.stringify(qualified)}`,
  );
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 7.5.2 HOSPITAL IDENTITY RESOLUTION VERIFICATION");
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
  console.log("\n❌ PHASE 7.5.2 HOSPITAL IDENTITY RESOLUTION VERIFICATION: FAILED");
  process.exit(1);
} else {
  console.log("\n✅ PHASE 7.5.2 HOSPITAL IDENTITY RESOLUTION VERIFICATION: ALL TESTS PASSED");
}
