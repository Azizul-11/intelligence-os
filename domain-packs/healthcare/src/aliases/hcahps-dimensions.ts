import type { AliasDefinition } from "@intelligence/domain-sdk";

// Batch 5B-3: aliases for the HCAHPS survey dimensions (concepts/hcahps-dimensions.ts).
// - Concept aliases name the dimension. The first one is the display name (the one the prompt shows).
// - A dimension alone names no metric, so a bare phrase ("cleanest hospitals") is completed by a lay-vocabulary group
//   (runtime/lay-vocabulary.ts); formally worded questions ("nurse communication scores", "highest scores for
//   cleanliness", "discharge information ranking") are completed by the composite metric aliases below - the same
//   hip/knee overlap pattern as aliases/patient-safety-indicator.ts: the metric text is a strict superset of a concept
//   alias, never the identical text (an identical metric+concept alias broke resolution in 5B-2).
// - Nothing with the word "doctors" is registered: "doctors" is a pre-check topic (prices or individual doctors), so
//   such a phrase would be refused before it is ever resolved. "Doctor Communication" (singular) is safe.
// - "sanitary" (D9) is aliased here and is also a lay group with an interpretation note.

const concept = (id: string, aliases: string[]): AliasDefinition => ({
  id,
  canonical: id,
  aliases,
  type: "concept",
  description: `Canonical healthcare term for the ${aliases[0]} patient-survey dimension.`,
});

export const hcahpsCleanlinessAlias = concept("hcahps-cleanliness", [
  "Cleanliness",
  "Cleanest",
  "Clean Rooms",
  "Cleanest Rooms",
  "Room and Bathroom Cleanliness",
  "Hospital Room and Bathroom Cleanliness",
  "Sanitary",
  "Most Sanitary",
]);
export const hcahpsNurseCommunicationAlias = concept("hcahps-nurse-communication", ["Nurse Communication", "Communication With Nurses"]);
export const hcahpsDoctorCommunicationAlias = concept("hcahps-doctor-communication", ["Doctor Communication"]);
export const hcahpsMedicineCommunicationAlias = concept("hcahps-medicine-communication", ["Communication About Medicines", "Medicine Communication"]);
export const hcahpsDischargeInformationAlias = concept("hcahps-discharge-information", [
  "Discharge Information",
  "Discharge Instructions",
  "Instructions for Going Home",
]);
export const hcahpsQuietnessAlias = concept("hcahps-quietness", ["Quietness", "Quietest", "Quiet at Night"]);
export const hcahpsRecommendAlias = concept("hcahps-recommend", [
  "Recommend Hospital",
  "Patients Would Recommend",
  "Would Definitely Recommend",
  "Recommend the Hospital",
]);
export const hcahpsOverallSurveyRatingAlias = concept("hcahps-overall-survey-rating", ["Overall Survey Rating", "Patient Rating of the Hospital"]);
export const hcahpsSummaryStarAlias = concept("hcahps-summary-star", [
  "Survey Summary Star",
  "Patient Survey Star Rating",
  "Patient Survey Star Ratings",
  "Patient Experience Star Rating",
  "Survey Star Rating",
  "HCAHPS Star Rating",
  "Summary Star Rating",
]);

// Composite metric aliases: "<dimension> score(s)/ranking(s)", "score(s) for <dimension>".
const DIMENSION_TERMS = [
  "cleanliness",
  "room and bathroom cleanliness",
  "hospital room and bathroom cleanliness",
  "quietness",
  "nurse communication",
  "doctor communication",
  "communication about medicines",
  "discharge information",
  "discharge instructions",
  "overall survey rating",
];
const DIMENSION_METRIC_ALIASES = DIMENSION_TERMS.flatMap((term) => [
  `${term} score`,
  `${term} scores`,
  `${term} ranking`,
  `${term} rankings`,
  `score for ${term}`,
  `scores for ${term}`,
]);

export const hcahpsDimensionMetricAlias: AliasDefinition = {
  id: "patient-experience-dimension",
  canonical: "patient-experience",
  aliases: DIMENSION_METRIC_ALIASES,
  type: "metric",
  description: "Batch 5B-3: composite phrases that name a patient-survey dimension together with the Patient Experience metric.",
};
