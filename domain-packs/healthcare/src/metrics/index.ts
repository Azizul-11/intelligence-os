export * from "./metric-categories";

export * from "./hospital-overall-rating";
export * from "./mortality-rate";
export * from "./readmission-rate";
export * from "./emergency-department-visits";
export * from "./patient-experience";
export * from "./length-of-stay";
export * from "./hospital-count";
export * from "./hospital-list";

import { hospitalOverallRatingMetric } from "./hospital-overall-rating";
import { mortalityRateMetric } from "./mortality-rate";
import { readmissionRateMetric } from "./readmission-rate";
import { emergencyDepartmentVisitsMetric } from "./emergency-department-visits";
import { patientExperienceMetric } from "./patient-experience";
import { lengthOfStayMetric } from "./length-of-stay";
import { hospitalCountMetric } from "./hospital-count";
import { hospitalListMetric } from "./hospital-list";

export const healthcareMetrics = [
  hospitalOverallRatingMetric,
  mortalityRateMetric,
  readmissionRateMetric,
  emergencyDepartmentVisitsMetric,
  patientExperienceMetric,
  lengthOfStayMetric,
  hospitalCountMetric,
  hospitalListMetric,
] as const;