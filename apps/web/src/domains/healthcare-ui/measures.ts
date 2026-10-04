import { asNumber, displayValue, type Row } from "@/modules/workspace/lib/result-format";

// Display catalog for the 56-column hospital profile: plain-language names, units and which direction is favourable.
// Direction mirrors the domain's metric definitions (lower is better for death, readmission and safety rates).

export type Direction = "lower" | "higher";
export type Unit = "" | "%";

export type Measure = { key: string; label: string; unit?: Unit; ofKey?: string };
export type CompareRow = Measure & { direction?: Direction; kind?: "text" | "flag" };

export type Section = {
  id: string;
  tab: "outcomes" | "safety" | "experience";
  title: string;
  hint: string;
  direction: Direction;
  measures: Measure[];
};

const measure = (key: string, label: string, unit: Unit = ""): Measure => ({ key, label, unit });

export const SECTIONS: Section[] = [
  {
    id: "deaths",
    tab: "outcomes",
    title: "30-day death and complication rates",
    hint: "Percent of patients, risk-adjusted. Lower is better.",
    direction: "lower",
    measures: [
      measure("hybrid_hwm_score", "Hospital-wide death rate", "%"),
      measure("mort_30_ami_score", "Heart attack death rate", "%"),
      measure("mort_30_hf_score", "Heart failure death rate", "%"),
      measure("mort_30_pn_score", "Pneumonia death rate", "%"),
      measure("mort_30_copd_score", "COPD death rate", "%"),
      measure("mort_30_cabg_score", "Heart bypass surgery death rate", "%"),
      measure("mort_30_stk_score", "Stroke death rate", "%"),
      measure("comp_hip_knee_score", "Hip and knee replacement complication rate", "%"),
    ],
  },
  {
    id: "readmissions",
    tab: "outcomes",
    title: "30-day readmissions",
    hint: "Excess readmission ratio: 1.00 is the national expectation. Lower is better.",
    direction: "lower",
    measures: [
      measure("readm_30_ami_ratio", "Heart attack readmissions"),
      measure("readm_30_hf_ratio", "Heart failure readmissions"),
      measure("readm_30_pn_ratio", "Pneumonia readmissions"),
      measure("readm_30_copd_ratio", "COPD readmissions"),
      measure("readm_30_cabg_ratio", "Heart bypass surgery readmissions"),
      measure("readm_30_hip_knee_ratio", "Hip and knee replacement readmissions"),
    ],
  },
  {
    id: "safety",
    tab: "safety",
    title: "Patient safety indicators",
    hint: "Preventable harm during a hospital stay; the composite is the overall safety index. Lower is better.",
    direction: "lower",
    measures: [
      measure("psi_90_score", "Overall patient safety composite"),
      measure("psi_03_score", "Pressure ulcers"),
      measure("psi_04_score", "Death after a serious treatable complication"),
      measure("psi_06_score", "Collapsed lung from a procedure"),
      measure("psi_08_score", "In-hospital fall with hip fracture"),
      measure("psi_09_score", "Bleeding after surgery"),
      measure("psi_10_score", "Kidney injury needing dialysis after surgery"),
      measure("psi_11_score", "Breathing failure after surgery"),
      measure("psi_12_score", "Blood clot in the lung or leg after surgery"),
      measure("psi_13_score", "Blood infection (sepsis) after surgery"),
      measure("psi_14_score", "Surgical wound reopening"),
      measure("psi_15_score", "Accidental puncture or cut"),
    ],
  },
  {
    id: "experience",
    tab: "experience",
    title: "Patient survey scores",
    hint: "Average score out of 100 from patient surveys. Higher is better.",
    direction: "higher",
    measures: [
      measure("avg_patient_satisfaction", "Overall patient satisfaction"),
      measure("hcahps_recommend_score", "Would recommend the hospital"),
      measure("hcahps_nurse_comm_score", "Nurses communicate well"),
      measure("hcahps_doctor_comm_score", "Doctors communicate well"),
      measure("hcahps_medicine_comm_score", "Staff explain medicines"),
      measure("hcahps_discharge_info_score", "Discharge information"),
      measure("hcahps_cleanliness_score", "Room and bathroom cleanliness"),
      measure("hcahps_quietness_score", "Quiet at night"),
    ],
  },
];

// Counts of measures the data source already compared with the national rate, per measure family.
export const FAMILIES = [
  { prefix: "mort", label: "Mortality" },
  { prefix: "readm", label: "Readmissions" },
  { prefix: "safety", label: "Safety" },
] as const;

export const COMPARE_GROUPS: { id: string; title: string; hint?: string; rows: CompareRow[] }[] = [
  {
    id: "overview",
    title: "Rating and national comparison",
    hint: "Counts are how many reported measures the data source places better or worse than the national rate.",
    rows: [
      { key: "overall_rating", label: "Overall rating (stars)", direction: "higher" },
      ...FAMILIES.flatMap((family) => [
        { key: `${family.prefix}_measures_better`, label: `${family.label}: measures better than national`, direction: "higher" as const, ofKey: `facility_${family.prefix}_measure_count` },
        { key: `${family.prefix}_measures_worse`, label: `${family.label}: measures worse than national`, direction: "lower" as const, ofKey: `facility_${family.prefix}_measure_count` },
      ]),
    ],
  },
  ...SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    hint: section.hint,
    rows: section.measures.map((item): CompareRow => ({ ...item, direction: section.direction })),
  })),
  {
    id: "profile",
    title: "Hospital profile",
    rows: [
      { key: "hospital_type", label: "Hospital type", kind: "text" },
      { key: "ownership", label: "Ownership", kind: "text" },
      { key: "county", label: "County", kind: "text" },
      { key: "emergency_services", label: "Emergency services", kind: "flag" },
      { key: "birthing_friendly", label: "Birthing friendly", kind: "flag" },
    ],
  },
];

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const MISSING = new Set(["", "n/a", "not available", "not applicable", "null"]);

// A profile result: one or more rows that carry the full measure columns of this catalog.
export function isHospitalProfile(rows: Row[]): boolean {
  return rows.length > 0 && rows.every((row) => "facility_id" in row && "mort_30_ami_score" in row);
}

export type Reading = { text: string | null; num: number | null };

// One cell's value as display text plus its number (for comparing). Missing data is null, never 0 or blank.
export function readValue(row: Row, item: CompareRow): Reading {
  const raw = row[item.key];
  if (raw === null || raw === undefined || (typeof raw === "string" && MISSING.has(raw.trim().toLowerCase()))) {
    return { text: null, num: null };
  }
  if (item.kind === "flag") {
    return { text: raw === true || raw === "Y" || raw === "Yes" ? "Yes" : "No", num: null };
  }
  if (item.kind === "text") return { text: displayValue(raw), num: null };
  const num = asNumber(raw);
  if (num === null) return { text: null, num: null };
  const outOf = item.ofKey ? asNumber(row[item.ofKey]) : null;
  return { text: `${NUMBER.format(num)}${item.unit ?? ""}${outOf !== null ? ` of ${outOf}` : ""}`, num };
}
