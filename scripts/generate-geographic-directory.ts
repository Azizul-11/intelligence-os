/**
 * Pre-Phase 9 Tier0 Task 1 - Generates the Healthcare geographic directory.
 *
 * Reads distinct cities from the existing hospital-identity-directory.ts
 * (city data already present per facility) and distinct counties from the
 * CMS source CSV, then emits a plain TypeScript data module containing
 * COUNTIES and CITIES Maps with canonical values and associated states.
 *
 * Why reuse existing hospital-identity-directory.ts for cities:
 * - City data already extracted and normalized in hospital identity records
 * - Avoids duplicate CSV parsing and normalization logic
 * - Single source of truth: hospital-identity-directory.ts
 *
 * Why extract counties from CMS CSV:
 * - County data was recently added to hospital-identity-directory.ts
 * - Need distinct county list with state associations
 * - Same deterministic source: CMS Hospital_General_Information.csv
 *
 * Collision handling:
 * - "albany" exists as both city (Albany, NY/GA) and county (Albany County, NY)
 * - Suffix matching: "albany county" → county, bare "albany" → city (prioritized)
 * - This is resolved at resolve() time in entity-provider.ts
 *
 * This script is run manually, once (or whenever source data changes);
 * its output is committed as a real source file.
 */

import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { hospitalIdentityDirectory } from "../domain-packs/healthcare/src/runtime/hospital-identity-directory";

const SOURCE_CSV = "data/raw/healthcare/cms/Hospital_General_Information.csv";
const OUTPUT_FILE = "domain-packs/healthcare/src/runtime/geographic-directory.ts";

interface CmsRow {
  State: string;
  "City/Town": string;
  "County/Parish": string;
}

/**
 * Generic text normalization - matches entity-provider.ts normalizeText()
 */
function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract distinct cities from existing hospital-identity-directory.ts
const cityMap = new Map<string, Set<string>>();

for (const record of hospitalIdentityDirectory) {
  if (!record.city || !record.state) continue;
  
  const normalizedCity = normalizeText(record.city);
  const stateCode = record.state.trim().toUpperCase();
  
  if (!cityMap.has(normalizedCity)) {
    cityMap.set(normalizedCity, new Set());
  }
  cityMap.get(normalizedCity)!.add(stateCode);
}

console.log(`Extracted ${cityMap.size} distinct cities from hospital-identity-directory.ts`);

// Extract distinct counties from CMS CSV
const countyMap = new Map<string, Set<string>>();

const raw = readFileSync(SOURCE_CSV, "utf-8");
const rows: CmsRow[] = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  bom: true,
});

for (const row of rows) {
  const county = row["County/Parish"]?.trim();
  const state = row["State"]?.trim();
  
  if (!county || !state) continue;
  
  const normalizedCounty = normalizeText(county);
  const stateCode = state.toUpperCase();
  
  if (!countyMap.has(normalizedCounty)) {
    countyMap.set(normalizedCounty, new Set());
  }
  countyMap.get(normalizedCounty)!.add(stateCode);
}

console.log(`Extracted ${countyMap.size} distinct counties from CMS source CSV`);

// Build COUNTIES Map entries
const countiesEntries: string[] = [];
const sortedCounties = Array.from(countyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

for (const [normalizedCounty, states] of sortedCounties) {
  const canonical = Array.from(countyMap.entries())
    .find(([key]) => key === normalizedCounty)?.[0] || normalizedCounty;
  
  // Get the original uppercase county name from the first occurrence in the CSV
  const originalCounty = rows.find(row => 
    normalizeText(row["County/Parish"]?.trim() || "") === normalizedCounty
  )?.["County/Parish"]?.trim() || canonical.toUpperCase();
  
  const statesArray = Array.from(states).sort();
  
  countiesEntries.push(
    `  ["${normalizedCounty}", { canonical: "${originalCounty}", states: ${JSON.stringify(statesArray)} }]`
  );
}

// Build CITIES Map entries
const citiesEntries: string[] = [];
const sortedCities = Array.from(cityMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

for (const [normalizedCity, states] of sortedCities) {
  // Get the original uppercase city name from hospital-identity-directory
  const originalCity = hospitalIdentityDirectory.find(record =>
    normalizeText(record.city) === normalizedCity
  )?.city || normalizedCity.toUpperCase();
  
  const statesArray = Array.from(states).sort();
  
  citiesEntries.push(
    `  ["${normalizedCity}", { canonical: "${originalCity}", states: ${JSON.stringify(statesArray)} }]`
  );
}

const header = `/**
 * Healthcare geographic directory.
 *
 * Generated deterministically from:
 * - Cities: hospital-identity-directory.ts (city field per facility)
 * - Counties: data/raw/healthcare/cms/Hospital_General_Information.csv (County/Parish column)
 * by scripts/generate-geographic-directory.ts.
 *
 * Not hand-maintained; regenerate from that script if source data changes.
 *
 * This provides canonical city and county values for entity resolution and
 * SQL template parameter binding in Pre-Phase 9 Tier0 Task 1 geographic filtering.
 *
 * Collision handling: Bare "albany" can match both city (Albany, NY/GA) and
 * county (Albany County, NY). Resolution logic in entity-provider.ts:
 * - If phrase contains " county" suffix → county
 * - Otherwise → city (prioritized)
 */

export interface GeographicValue {
  canonical: string;  // Original uppercase name from source
  states: string[];   // Two-letter state codes where this value exists
}

/**
 * COUNTIES Map: normalized county name → canonical county + states
 * 
 * Keys are normalized (lowercase, no punctuation) for matching.
 * Accepts both "albany" and "albany county" keys via suffix stripping
 * in entity-provider.ts resolve() logic.
 */
export const COUNTIES = new Map<string, GeographicValue>([
${countiesEntries.join(",\n")}
]);

/**
 * CITIES Map: normalized city name → canonical city + states
 * 
 * Keys are normalized (lowercase, no punctuation) for matching.
 */
export const CITIES = new Map<string, GeographicValue>([
${citiesEntries.join(",\n")}
]);
`;

writeFileSync(OUTPUT_FILE, header, "utf-8");

console.log(`Wrote ${OUTPUT_FILE}`);
console.log(`Summary: ${countyMap.size} counties, ${cityMap.size} cities`);

// Verification: Check for key geographic values
const albanyCounty = countyMap.get("albany");
const albanyCity = cityMap.get("albany");
const birminghamCity = cityMap.get("birmingham");

console.log(`\nVerification:`);
console.log(`  Albany County: ${albanyCounty ? `Found in states: ${Array.from(albanyCounty).join(", ")}` : "NOT FOUND"}`);
console.log(`  Albany City: ${albanyCity ? `Found in states: ${Array.from(albanyCity).join(", ")}` : "NOT FOUND"}`);
console.log(`  Birmingham City: ${birminghamCity ? `Found in states: ${Array.from(birminghamCity).join(", ")}` : "NOT FOUND"}`);
