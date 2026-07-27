import type { WarehouseHospitalHcahps } from "../ingest/datasets/healthcare/hcahps/flatten";

import { upsertInBatches } from "./shared/upsert-in-batches";

function mapHospitalHcahps(
  record: WarehouseHospitalHcahps,
) {
  return {
    facility_id: record.facilityId,

    measure_code: record.measureCode,

    question: record.question,

    answer_description: record.answerDescription,

    patient_survey_star_rating: record.patientSurveyStarRating,
    patient_survey_star_rating_footnote:
      record.patientSurveyStarRatingFootnote,

    answer_percent: record.answerPercent,
    answer_percent_footnote:
      record.answerPercentFootnote,

    linear_mean_value: record.linearMeanValue,

    completed_surveys: record.completedSurveys,
    completed_surveys_footnote:
      record.completedSurveysFootnote,

    survey_response_rate_percent:
      record.surveyResponseRatePercent,
    survey_response_rate_percent_footnote:
      record.surveyResponseRatePercentFootnote,

    reporting_start_date: record.reportingStartDate,
    reporting_end_date: record.reportingEndDate,
  };
}

export async function insertHospitalHcahps(
  records: WarehouseHospitalHcahps[],
) {
  const rows = records.map(mapHospitalHcahps);

  return upsertInBatches(
    "warehouse_hospital_hcahps",
    rows,
    "facility_id,measure_code,reporting_start_date,reporting_end_date",
  );
}