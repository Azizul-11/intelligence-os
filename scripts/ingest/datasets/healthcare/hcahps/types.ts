/**
 * Raw CSV row exactly as received from CMS.
 * Every field is a string because CSV parsing occurs before normalization.
 */
export interface RawHcahpsRow {
  facilityId: string;
  facilityName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  telephoneNumber: string;

  measureCode: string;
  question: string;
  answerDescription: string;

  patientSurveyStarRating: string;
  patientSurveyStarRatingFootnote: string;

  answerPercent: string;
  answerPercentFootnote: string;

  linearMeanValue: string;

  completedSurveys: string;
  completedSurveysFootnote: string;

  surveyResponseRatePercent: string;
  surveyResponseRatePercentFootnote: string;

  reportingStartDate: string;
  reportingEndDate: string;
}

/**
 * Normalized record after cleaning and type conversion.
 */
export interface NormalizedHcahpsRecord {
  facilityId: string;

  measureCode: string;
  question: string;
  answerDescription: string;

  patientSurveyStarRating: string | null;
  patientSurveyStarRatingFootnote: string | null;

  answerPercent: number | null;
  answerPercentFootnote: string | null;

  linearMeanValue: number | null;

  completedSurveys: number | null;
  completedSurveysFootnote: string | null;

  surveyResponseRatePercent: number | null;
  surveyResponseRatePercentFootnote: string | null;

  reportingStartDate: Date;
  reportingEndDate: Date;
}

/**
 * Final warehouse row ready for insertion.
 */
export interface WarehouseHospitalHcahpsRow {
  facility_id: string;

  measure_code: string;
  question: string;
  answer_description: string;

  patient_survey_star_rating: string | null;
  patient_survey_star_rating_footnote: string | null;

  answer_percent: number | null;
  answer_percent_footnote: string | null;

  linear_mean_value: number | null;

  completed_surveys: number | null;
  completed_surveys_footnote: string | null;

  survey_response_rate_percent: number | null;
  survey_response_rate_percent_footnote: string | null;

  reporting_start_date: Date;
  reporting_end_date: Date;
}