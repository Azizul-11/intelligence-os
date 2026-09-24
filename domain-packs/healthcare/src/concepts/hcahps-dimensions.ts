import type { ConceptDefinition } from "@intelligence/domain-sdk";

// Batch 5B-3: the 8 HCAHPS survey dimensions plus the summary star, each a single measure code under the existing
// patient-experience metric (higher is better, unchanged flags). The composite "Patient Experience" (the average of
// all linear scores, patient-experience-ranking) is untouched - it applies whenever no dimension is named.
// Staff responsiveness (H_COMP_3) and care transition (H_COMP_7) have 0 rows in the warehouse and are not here.
// The summary star is named "Survey Summary Star", not "Summary Star Rating": "star rating" is an alias of the
// Hospital Overall Rating metric, and a concept name containing it puts two metrics in one canonical question.

const dimension = (id: string, displayName: string, description: string, measureCode: string): ConceptDefinition => ({
  id,
  name: id,
  displayName,
  description,
  measureCodesByMetric: { "patient-experience": measureCode },
});

export const hcahpsCleanliness = dimension("hcahps-cleanliness", "Cleanliness", "How often patients said their room and bathroom were kept clean.", "H_CLEAN_LINEAR_SCORE");
export const hcahpsNurseCommunication = dimension("hcahps-nurse-communication", "Nurse Communication", "How well patients said nurses communicated with them.", "H_COMP_1_LINEAR_SCORE");
export const hcahpsDoctorCommunication = dimension("hcahps-doctor-communication", "Doctor Communication", "How well patients said doctors communicated with them.", "H_COMP_2_LINEAR_SCORE");
export const hcahpsMedicineCommunication = dimension("hcahps-medicine-communication", "Communication About Medicines", "How well staff explained new medicines before giving them.", "H_COMP_5_LINEAR_SCORE");
export const hcahpsDischargeInformation = dimension("hcahps-discharge-information", "Discharge Information", "Whether patients were given information about recovering at home.", "H_COMP_6_LINEAR_SCORE");
export const hcahpsQuietness = dimension("hcahps-quietness", "Quietness", "How often patients said the area around their room was quiet at night.", "H_QUIET_LINEAR_SCORE");
export const hcahpsRecommend = dimension("hcahps-recommend", "Recommend Hospital", "Whether patients would recommend the hospital to friends and family.", "H_RECMND_LINEAR_SCORE");
export const hcahpsOverallSurveyRating = dimension("hcahps-overall-survey-rating", "Overall Survey Rating", "The rating patients gave the hospital on the survey (0 to 10), not the CMS overall star rating.", "H_HSP_RATING_LINEAR_SCORE");
export const hcahpsSummaryStar = dimension("hcahps-summary-star", "Survey Summary Star", "The HCAHPS summary star rating (1 to 5) across all survey dimensions.", "H_STAR_RATING");

export const hcahpsDimensionConcepts: readonly ConceptDefinition[] = [
  hcahpsCleanliness,
  hcahpsNurseCommunication,
  hcahpsDoctorCommunication,
  hcahpsMedicineCommunication,
  hcahpsDischargeInformation,
  hcahpsQuietness,
  hcahpsRecommend,
  hcahpsOverallSurveyRating,
  hcahpsSummaryStar,
];
