import type { NormalizedHospitalReadmissionRecord } from "./types";

function parseNullableNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();

  if (text === "") {
    return null;
  }

  const parsed = Number(text);

  return Number.isNaN(parsed) ? null : parsed;
}

function parseNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();

  return text === "" ? null : text;
}

function parseDate(value: unknown): Date {
  const text = String(value).trim();

  const [month, day, year] = text.split("/").map(Number);

  return new Date(year, month - 1, day);
}

export function normalizeHospitalReadmissionRecords(
  records: any[],
): NormalizedHospitalReadmissionRecord[] {
  return records.map((record) => ({
    facilityId: String(record["Facility ID"]).trim(),

    measureCode: String(record["Measure Name"]).trim(),

    state: String(record["State"]).trim(),

    numberOfDischargesRaw: parseNullableString(
      record["Number of Discharges"],
    ),

    numberOfReadmissionsRaw: parseNullableString(
      record["Number of Readmissions"],
    ),

    predictedReadmissionRate: parseNullableNumber(
      record["Predicted Readmission Rate"],
    ),

    expectedReadmissionRate: parseNullableNumber(
      record["Expected Readmission Rate"],
    ),

    excessReadmissionRatio: parseNullableNumber(
      record["Excess Readmission Ratio"],
    ),

    footnote: parseNullableString(record["Footnote"]),

    reportingStartDate: parseDate(record["Start Date"]),

    reportingEndDate: parseDate(record["End Date"]),
  }));
}