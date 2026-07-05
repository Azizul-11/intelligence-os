export * from "./analyze-patient-experience";
export * from "./compare-with-peers";
export * from "./investigate-length-of-stay";
export * from "./investigate-mortality";
export * from "./review-readmission";


import { analyzePatientExperienceRecommendation } from "./analyze-patient-experience";
import { compareWithPeersRecommendation } from "./compare-with-peers";
import { investigateLengthOfStayRecommendation } from "./investigate-length-of-stay";
import { investigateMortalityRecommendation } from "./investigate-mortality";
import { reviewReadmissionRecommendation } from "./review-readmission";


export const healthcareRecommendations = [
    analyzePatientExperienceRecommendation,
    compareWithPeersRecommendation,
    investigateLengthOfStayRecommendation,
    investigateMortalityRecommendation,
    reviewReadmissionRecommendation
] as const;