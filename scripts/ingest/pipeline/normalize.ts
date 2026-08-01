export interface NormalizedHospitalRecord {
  facilityId: string;
  hospitalName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  phoneNumber: string;
  hospitalType: string;
  ownership: string;
  emergencyServices: boolean;
  birthingFriendly: string | null;

  overallRating: string | null;
  overallRatingFootnote: string | null;

  mortGroupMeasureCount: number | null;
  facilityMortMeasureCount: number | null;
  mortMeasuresBetter: number | null;
  mortMeasuresNoDifferent: number | null;
  mortMeasuresWorse: number | null;
  mortGroupFootnote: string | null;

  safetyGroupMeasureCount: number | null;
  facilitySafetyMeasureCount: number | null;
  safetyMeasuresBetter: number | null;
  safetyMeasuresNoDifferent: number | null;
  safetyMeasuresWorse: number | null;
  safetyGroupFootnote: string | null;

  readmGroupMeasureCount: number | null;
  facilityReadmMeasureCount: number | null;
  readmMeasuresBetter: number | null;
  readmMeasuresNoDifferent: number | null;
  readmMeasuresWorse: number | null;
  readmGroupFootnote: string | null;

  patientExperienceGroupMeasureCount: number | null;
  facilityPatientExperienceMeasureCount: number | null;
  patientExperienceGroupFootnote: string | null;

  teGroupMeasureCount: number | null;
  facilityTeMeasureCount: number | null;
  teGroupFootnote: string | null;
}

function nullable(value: unknown): string | null {
  if (value == null) return null;

  const text = String(value).trim();

  if (
    text === "" ||
    text === "Not Available" ||
    text === "Not Applicable" ||
    text === "N/A"
  ) {
    return null;
  }

  return text;
}

function nullableNumber(value: unknown): number | null {
  const text = nullable(value);

  if (text === null) {
    return null;
  }

  const number = Number(text);

  return Number.isNaN(number)
    ? null
    : number;
}

export function normalizeRecords(records: any[]): NormalizedHospitalRecord[] {
  return records.map((record) => ({
    facilityId: record["Facility ID"]?.trim(),

    hospitalName: record["Facility Name"]?.trim(),

    address: record["Address"]?.trim(),

    city: record["City/Town"]?.trim(),

    state: record["State"]?.trim(),

    zipCode: record["ZIP Code"]?.trim(),

    county: record["County/Parish"]?.trim(),

    phoneNumber: record["Telephone Number"]?.trim(),

    hospitalType: record["Hospital Type"]?.trim(),

    ownership: record["Hospital Ownership"]?.trim(),

    emergencyServices:
      record["Emergency Services"]?.trim().toLowerCase() === "yes",
      birthingFriendly: nullable(
  record["Meets criteria for birthing friendly designation"],
),

overallRating: nullable(
  record["Hospital overall rating"],
),

overallRatingFootnote: nullable(
  record["Hospital overall rating footnote"],
),
mortGroupMeasureCount: nullableNumber(
  record["MORT Group Measure Count"],
),

facilityMortMeasureCount: nullableNumber(
  record["Count of Facility MORT Measures"],
),

mortMeasuresBetter: nullableNumber(
  record["Count of MORT Measures Better"],
),

mortMeasuresNoDifferent: nullableNumber(
  record["Count of MORT Measures No Different"],
),

mortMeasuresWorse: nullableNumber(
  record["Count of MORT Measures Worse"],
),

mortGroupFootnote: nullable(
  record["MORT Group Footnote"],
),
safetyGroupMeasureCount: nullableNumber(
  record["Safety Group Measure Count"],
),

facilitySafetyMeasureCount: nullableNumber(
  record["Count of Facility Safety Measures"],
),

safetyMeasuresBetter: nullableNumber(
  record["Count of Safety Measures Better"],
),

safetyMeasuresNoDifferent: nullableNumber(
  record["Count of Safety Measures No Different"],
),

safetyMeasuresWorse: nullableNumber(
  record["Count of Safety Measures Worse"],
),

safetyGroupFootnote: nullable(
  record["Safety Group Footnote"],
),

readmGroupMeasureCount: nullableNumber(
  record["READM Group Measure Count"],
),

facilityReadmMeasureCount: nullableNumber(
  record["Count of Facility READM Measures"],
),

readmMeasuresBetter: nullableNumber(
  record["Count of READM Measures Better"],
),

readmMeasuresNoDifferent: nullableNumber(
  record["Count of READM Measures No Different"],
),

readmMeasuresWorse: nullableNumber(
  record["Count of READM Measures Worse"],
),

readmGroupFootnote: nullable(
  record["READM Group Footnote"],
),

patientExperienceGroupMeasureCount: nullableNumber(
  record["Pt Exp Group Measure Count"],
),

facilityPatientExperienceMeasureCount: nullableNumber(
  record["Count of Facility Pt Exp Measures"],
),

patientExperienceGroupFootnote: nullable(
  record["Pt Exp Group Footnote"],
),

teGroupMeasureCount: nullableNumber(
  record["TE Group Measure Count"],
),

facilityTeMeasureCount: nullableNumber(
  record["Count of Facility TE Measures"],
),

teGroupFootnote: nullable(
  record["TE Group Footnote"],
),
  }));
}
