/**
 * 2026-09-19 - name grounding for Layer 3 summaries (supabase/functions/orchestrator/services/summary-grounding.ts).
 *
 * The numeric cross-check in chat.ts cannot see a hospital that is not in the
 * table. Live, both summaries shown on the frontend named hospitals that were
 * not in their tables and passed it. This proves the new check rejects exactly
 * those, and does not reject grounded phrasing. No network, no cost.
 *
 *  P. The two summaries and tables pasted from the frontend (verbatim).
 *  A. Grounded phrasing that must NOT be rejected.
 *  R. Invented names that must be rejected (incl. the documented safe-side limit).
 *
 * Run: npx tsx scripts/verify-summary-grounding.ts
 */
import { findUngroundedNames } from "../supabase/functions/orchestrator/services/summary-grounding";
import { DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/runtime/capability-catalog";

let pass = 0;
let fail = 0;
function check(id: string, label: string, condition: boolean, detail: string) {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${id} ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${id} ${label} -- ${detail}`);
  }
}

// Same vocabulary chat.ts passes.
const vocabulary = [
  ...DOMAIN_CAPABILITIES.states,
  ...DOMAIN_CAPABILITIES.ownerships,
  ...DOMAIN_CAPABILITIES.metrics.map((metric) => metric.displayName),
  ...(DOMAIN_CAPABILITIES.concepts ?? []).map((concept) => concept.displayName),
];
const run = (summary: string, question: string, rows: Record<string, unknown>[]) => findUngroundedNames(summary, question, rows, vocabulary);
const row = (hospital_name: string, city: string, state: string) => ({ city, state, hospital_name });

// --- P: pasted from the frontend --------------------------------------------------------------
const mortalityRows = [
  row("NYU LANGONE HOSPITALS", "NEW YORK", "NY"),
  row("CEDARS-SINAI MEDICAL CENTER", "LOS ANGELES", "CA"),
  row("NORTHSHORE UNIVERSITY HEALTHSYSTEM - EVANSTON HOSPITAL", "EVANSTON", "IL"),
  row("ADVENTHEALTH ORLANDO", "ORLANDO", "FL"),
  row("MAYO CLINIC", "JACKSONVILLE", "FL"),
  row("MASSACHUSETTS GENERAL HOSPITAL", "BOSTON", "MA"),
  row("MAYO CLINIC HOSPITAL ROCHESTER", "ROCHESTER", "MN"),
  row("HACKENSACK UNIVERSITY MEDICAL CENTER", "HACKENSACK", "NJ"),
  row("NEW YORK-PRESBYTERIAN HOSPITAL", "NEW YORK", "NY"),
  row("CLEVELAND CLINIC", "CLEVELAND", "OH"),
];
const mortalitySummary =
  "The table provides information on hospitals with the best mortality rate in the United States. Among the listed hospitals, Mayo Clinic in Rochester, MN has the best mortality rate with 0 measures worse, 6 better, and 2 no different. The table also ranks hospitals based on the number of mortality measure counts. Hospitals with the highest counts are: 1. Cleveland Clinic (Cleveland, OH) with 8 mortality measure counts 2. New York-Presbyterian Hospital (New York, NY) with 8 mortality measure counts 3. Hackensack University Medical Center (Hackensack, NJ) with 8 mortality measure counts 4. Mayo Clinic (Rochester, MN) with 8 mortality measure counts 5. Mount Sinai Hospital (New York, NY) with 8 mortality measure counts 6. Cedars-Sinai Medical Center (Los Angeles, CA) with 8 mortality measure counts 7. University of Pittsburgh Medical Center (Pittsburgh, PA) with 8 mortality measure counts 8. New England Medical Center (Boston, MA) with 8 mortality measure counts";

const ratingRows = [
  row("ADVENTIST HEALTH HOWARD MEMORIAL", "WILLITS", "CA"),
  row("ADVENTHEALTH CASTLE ROCK", "CASTLE ROCK", "CO"),
  row("AdventHealth Parker", "PARKER", "CO"),
  row("ADVENTHEALTH DAYTONA BEACH", "DAYTONA BEACH", "FL"),
  row("ADVENTHEALTH FISH MEMORIAL", "ORANGE CITY", "FL"),
  row("AdventHealth Palm Coast", "PALM COAST", "FL"),
  row("ADVENTHEALTH WESLEY CHAPEL", "WESLEY CHAPEL", "FL"),
  row("ADVENTHEALTH MURRAY", "CHATSWORTH", "GA"),
  row("ADVOCATE GOOD SHEPHERD HOSPITAL", "BARRINGTON", "IL"),
  row("ADVENTHEALTH HENDERSONVILLE", "HENDERSONVILLE", "NC"),
];
const ratingSummary =
  "The table presents data on hospitals in various locations in the United States, with each row representing a different hospital and their ratings based on mortality measures. All hospitals have an overall rating of 5, indicating they meet or exceed expected performance standards. However, some hospitals have better, worse, or no change in mortality measures compared to other hospitals. Hospitals with the best performance in mortality measures are AdventHealth Daytona Beach in Florida, AdventHealth Hendersonville in North Carolina, and AdventHealth Orlando in Florida, with no worse, better, or no change in mortality measures, respectively.";

console.log("\n--- P. The two summaries pasted from the frontend ---");
{
  const found = run(mortalitySummary, "Show me hospitals with best Mortality Rate", mortalityRows);
  check("P1", `Mortality Rate summary -> flags exactly the 3 hospitals that are not in the table (${JSON.stringify(found)}) and none of the 5 that are`,
    JSON.stringify([...found].sort()) === JSON.stringify(["Mount Sinai Hospital", "New England Medical Center", "Pittsburgh Medical Center"]), JSON.stringify(found));
  const found2 = run(ratingSummary, "which hospitals have the best overall rating and lowest mortality", ratingRows);
  check("P2", `overall-rating summary -> flags exactly AdventHealth Orlando (${JSON.stringify(found2)}); "United States", Florida, North Carolina and the 2 AdventHealth hospitals that ARE in the table pass`,
    JSON.stringify(found2) === JSON.stringify(["AdventHealth Orlando"]), JSON.stringify(found2));
}

// --- A / R: fixtures ---------------------------------------------------------------------------
const rows = [
  row("HOUSTON METHODIST HOSPITAL", "HOUSTON", "TX"),
  row("MAYO CLINIC HOSPITAL ROCHESTER", "ROCHESTER", "MN"),
  row("CLEVELAND CLINIC", "CLEVELAND", "OH"),
  row("CEDARS-SINAI MEDICAL CENTER", "LOS ANGELES", "CA"),
  row("ST MARYS MEDICAL CENTER", "PASSAIC", "NJ"),
];
const question = "best hospitals for patient experience in Texas";

console.log("\n--- A. Grounded phrasing must not be rejected ---");
for (const [id, label, summary] of [
  ["A1", "a hospital named at the start of a sentence", "Houston Methodist Hospital has the best overall rating in Texas."],
  ["A2", 'leading "The" before a name', "The Mayo Clinic in Rochester leads with 6 better measures."],
  ["A3", "a shortened form of a real name (words all in one row value)", "Mayo Clinic Rochester and Cleveland Clinic both rank well."],
  ["A4", '"United States" and spelled-out state names (rows hold codes)', "In the United States, hospitals in North Carolina and New York differ."],
  ["A5", "title-cased metric names (from the question and the platform vocabulary)", "Patient Experience and Safety Performance are the metrics compared."],
  ["A6", "possessive and hyphenated name", "Cedars-Sinai Medical Center's overall rating is 5."],
  ["A7", 'abbreviation and possessive ("St. Mary\'s" vs the row "ST MARYS")', "St. Mary's Medical Center is highlighted."],
  ["A8", 'sentence opener "Among"', "Among Mayo Clinic and Cleveland Clinic, the ratings are equal."],
  ["A9", "comma-separated list", "Cleveland Clinic, Mayo Clinic, and Cedars-Sinai Medical Center lead."],
  ["A10", "no proper names at all", "No hospital stood out in this table."],
  ["A11", "a catalog metric name", "Hospital Overall Rating is 5 for the first hospital."],
] as const) {
  const found = run(summary, question, rows);
  check(id, `${label} -> nothing flagged`, found.length === 0, JSON.stringify(found));
}

console.log("\n--- R. Invented names must be rejected ---");
for (const [id, label, summary, expected] of [
  ["R1", "an invented 4-word name at the start of a sentence", "New England Medical Center leads the ranking.", ["New England Medical Center"]],
  ["R2", "an invented 2-word name at the start of a sentence (the case a naive 'skip the first word' rule would let through)", "Mount Sinai leads the ranking.", ["Mount Sinai"]],
  ["R3", "an invented name beside a real one - only the invented one flagged", "The leaders are Johns Hopkins Hospital and Mayo Clinic.", ["Johns Hopkins Hospital"]],
  ["R4", "words scattered across different rows/cells do not make a name", "Houston Rochester Clinic leads.", ["Houston Rochester Clinic"]],
  ["R5", "SAFE-SIDE LIMIT: an embellished real name is rejected (only the optional sentence is lost)", "Cleveland Clinic Foundation leads.", ["Cleveland Clinic Foundation"]],
] as const) {
  const found = run(summary, question, rows);
  check(id, `${label} -> ${JSON.stringify(expected)}`, JSON.stringify(found) === JSON.stringify(expected), JSON.stringify(found));
}

// --- C: found by replaying real free-chain summaries after the first deploy -------------------
console.log("\n--- C. Found on real summaries: counties, and a real fabricated hybrid name ---");
{
  // CMS stores the county as "COLQUITT"; a summary says "Colquitt County". The first version rejected every such summary.
  const countyRows = [
    { hospital_name: "COLQUITT REGIONAL MEDICAL CENTER", city: "MOULTRIE", county: "COLQUITT", state: "GA" },
    { hospital_name: "PIEDMONT HOSPITAL, INC", city: "ATLANTA", county: "FULTON", state: "GA" },
    { hospital_name: "SOUTHEAST GEORGIA HEALTH SYSTEM -- CAMDEN CAMPUS", city: "SAINT MARYS", county: "CAMDEN", state: "GA" },
  ];
  const q = "Show me government hospitals in Georgia";
  const grounded = run("The table lists government hospitals in Georgia, including COLQUITT REGIONAL MEDICAL CENTER in Moultrie (Colquitt County), PIEDMONT HOSPITAL, INC in Atlanta (Fulton County) and Camden County.", q, countyRows);
  check("C1", '"Colquitt County" / "Fulton County" / "Camden County" (rows hold COLQUITT / FULTON / CAMDEN) -> nothing flagged', grounded.length === 0, JSON.stringify(grounded));
  const invented = run("Hospitals in Orange County stand out.", q, countyRows);
  check("C2", "a county that is NOT in the rows is still flagged (the suffix is ignored, the name is not)", JSON.stringify(invented) === JSON.stringify(["Orange County"]), JSON.stringify(invented));
  const inventedName = run("Narnia County Medical Center leads.", q, countyRows);
  check("C3", "an invented name that merely contains a county word is still flagged", JSON.stringify(inventedName) === JSON.stringify(["Narnia County Medical Center"]), JSON.stringify(inventedName));

  // Verbatim shape of a live free-chain answer: it fused two different hospitals into one and quoted a score that is not in the table.
  const hybridRows = [
    row("UNITY MEDICAL CENTER", "MANCHESTER", "TN"),
    row("TULSA SPINE & SPECIALTY HOSPITAL", "TULSA", "OK"),
    row("ORTHOPAEDIC HOSPITAL OF WISCONSIN", "GLENDALE", "WI"),
    row("BOONE MEMORIAL HOSPITAL", "MADISON", "WV"),
  ];
  const hybrid = run("Among the listed hospitals, Unity Medical Center in Manchester, Tulsa Orthopaedic Hospital of Wisconsin, and Boone Memorial Hospital in Madison have the highest scores.", "Show me hospitals with best Patient Experience", hybridRows);
  check("C4", "a real fabricated hybrid (two hospitals fused into one) -> only the hybrid flagged, the two real ones pass", JSON.stringify(hybrid) === JSON.stringify(["Tulsa Orthopaedic Hospital"]), JSON.stringify(hybrid));
}

console.log("\n" + "=".repeat(100));
console.log(`RESULT: ${pass} passed, ${fail} failed (${pass + fail} total)`);
console.log("=".repeat(100));
if (fail > 0) {
  process.exit(1);
}
