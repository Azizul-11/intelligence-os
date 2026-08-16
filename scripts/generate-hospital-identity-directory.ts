/**
 * Phase 7.5.2 - Generates the Healthcare hospital identity directory.
 *
 * Reads the real, deterministic CMS source data (the same file already
 * ingested into the warehouse) and emits a plain TypeScript data module
 * containing every hospital's facility_id, name, state, and city.
 *
 * Why a generated static module rather than a runtime CSV/DB read:
 * - EntityProvider.resolve() is a synchronous Universal interface; a
 *   live DB call here would require changing that interface, which this
 *   task is explicitly scoped not to do.
 * - The Healthcare domain pack is bundled (esbuild, platform=neutral)
 *   into supabase/functions/orchestrator's deployed edge function; that
 *   deployment target has no access to data/raw/*.csv at runtime, so a
 *   runtime file read would not work in production, only in local dev.
 * - The data volume (~5,500 rows, a few hundred KB as a TS literal) is
 *   well within normal bounds for a bundled module - orders of
 *   magnitude smaller than raw source files already present in this
 *   repository - so this is not "too large" for the existing
 *   synchronous, in-memory EntityProvider pattern (the same pattern
 *   already used, at smaller scale, for the 50-entry state lookup).
 *
 * This script is run manually, once (or whenever the source CMS data
 * changes); its output is committed as a real source file, exactly like
 * every other Healthcare domain-pack file.
 */

import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";

const SOURCE_CSV = "data/raw/healthcare/cms/Hospital_General_Information.csv";
const OUTPUT_FILE = "domain-packs/healthcare/src/runtime/hospital-identity-directory.ts";

interface CmsRow {
  "Facility ID": string;
  "Facility Name": string;
  State: string;
  "City/Town": string;
}

const raw = readFileSync(SOURCE_CSV, "utf-8");

const rows: CmsRow[] = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  bom: true,
});

const records = rows
  .map((row) => ({
    facilityId: row["Facility ID"]?.trim() ?? "",
    hospitalName: row["Facility Name"]?.trim() ?? "",
    state: row["State"]?.trim() ?? "",
    city: row["City/Town"]?.trim() ?? "",
  }))
  .filter((r) => r.facilityId && r.hospitalName);

console.log(`Read ${rows.length} rows, emitting ${records.length} hospital identity records.`);

const header = `/**
 * Healthcare hospital identity directory.
 *
 * Generated deterministically from the real CMS source data
 * (data/raw/healthcare/cms/Hospital_General_Information.csv) by
 * scripts/generate-hospital-identity-directory.ts. Not hand-maintained;
 * regenerate from that script if the source data changes.
 *
 * This is the canonical facility_id identity data used by
 * HealthcareEntityProvider to resolve named hospital mentions.
 */

export interface HospitalIdentityRecord {
  facilityId: string;
  hospitalName: string;
  state: string;
  city: string;
}

export const hospitalIdentityDirectory: HospitalIdentityRecord[] = ${JSON.stringify(records, null, 2)};
`;

writeFileSync(OUTPUT_FILE, header, "utf-8");

console.log(`Wrote ${OUTPUT_FILE}`);
