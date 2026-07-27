import type { NormalizedHcahpsRecord } from "./types";

function parseNullableNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();

  if (
    text === "" ||
    text === "Not Available" ||
    text === "Not Applicable"
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

export function normalizeHospitalHcahpsRecords(
  records: any[],
): NormalizedHcahpsRecord[] {
  return records.map((record) => ({
    facilityId: String(record["Facility ID"]).trim(),

    measureCode: String(record["HCAHPS Measure ID"]).trim(),

    question: String(record["HCAHPS Question"]).trim(),

    answerDescription: String(
      record["HCAHPS Answer Description"],
    ).trim(),

    patientSurveyStarRating: parseNullableString(
      record["Patient Survey Star Rating"],
    ),

    patientSurveyStarRatingFootnote: parseNullableString(
      record["Patient Survey Star Rating Footnote"],
    ),

    answerPercent: parseNullableNumber(
      record["HCAHPS Answer Percent"],
    ),

    answerPercentFootnote: parseNullableString(
      record["HCAHPS Answer Percent Footnote"],
    ),

    linearMeanValue: parseNullableNumber(
      record["HCAHPS Linear Mean Value"],
    ),

    completedSurveys: parseNullableNumber(
      record["Number of Completed Surveys"],
    ),

    completedSurveysFootnote: parseNullableString(
      record["Number of Completed Surveys Footnote"],
    ),

    surveyResponseRatePercent: parseNullableNumber(
      record["Survey Response Rate Percent"],
    ),

    surveyResponseRatePercentFootnote: parseNullableString(
      record["Survey Response Rate Percent Footnote"],
    ),

    reportingStartDate: parseDate(
      record["Start Date"],
    ),

    reportingEndDate: parseDate(
      record["End Date"],
    ),
  }));
}