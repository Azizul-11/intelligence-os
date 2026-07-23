import type { NormalizedHospitalClinicalOutcomeRecord } from "./types";

function parseNullableNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();

  if (
    text === "" ||
    text === "Not Available"
  ) {
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

export function normalizeHospitalClinicalOutcomeRecords(
  records: any[],
): NormalizedHospitalClinicalOutcomeRecord[] {
  return records.map((record) => ({
    facilityId: String(record["Facility ID"]).trim(),

    measureCode: String(record["Measure ID"]).trim(),

    measureName: String(record["Measure Name"]).trim(),

    comparedToNational: parseNullableString(
      record["Compared to National"],
    ),

    denominator: parseNullableNumber(
      record["Denominator"],
    ),

    score: parseNullableNumber(
      record["Score"],
    ),

    lowerEstimate: parseNullableNumber(
      record["Lower Estimate"],
    ),

    higherEstimate: parseNullableNumber(
      record["Higher Estimate"],
    ),

    footnote: parseNullableString(
      record["Footnote"],
    ),

    reportingStartDate: parseDate(
      record["Start Date"],
    ),

    reportingEndDate: parseDate(
      record["End Date"],
    ),
  }));
}