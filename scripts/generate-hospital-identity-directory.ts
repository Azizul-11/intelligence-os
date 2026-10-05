/** Phase 7.5.2: generates the hospital identity directory (facility_id, name, state, city) from the CMS CSV as a static TS module.
 * Static because EntityProvider.resolve() is synchronous and the edge bundle has no runtime access to data/raw/*.csv. Run manually when CMS data changes; output is committed. */

import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";

const SOURCE_CSV = "data/raw/healthcare/cms/Hospital_General_Information.csv";
const OUTPUT_FILE = "domain-packs/healthcare/src/runtime/hospital-identity-directory.ts";

interface CmsRow {
  "Facility ID": string;
  "Facility Name": string;
  State: string;
  "City/Town": string;
  "County/Parish": string;
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
    county: row["County/Parish"]?.trim() ?? "",
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
  county: string;
}

export const hospitalIdentityDirectory: HospitalIdentityRecord[] = ${JSON.stringify(records, null, 2)};
`;

writeFileSync(OUTPUT_FILE, header, "utf-8");

console.log(`Wrote ${OUTPUT_FILE}`);
