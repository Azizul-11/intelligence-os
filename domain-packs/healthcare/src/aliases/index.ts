export * from "./acute-myocardial-infarction";
export * from "./cms";
export * from "./emergency-department";
export * from "./hcahps";
export * from "./hospital-overall-rating";
export * from "./readmission";
export * from "./patient-experience";
export * from "./emergency-department-visits";
export * from "./length-of-stay";
export * from "./mortality-rate";
export * from "./hospital-count";
export * from "./hospital-list";
export * from "./safety-performance";
export * from "./county";
export * from "./state-dimension";
export * from "./year";
export * from "./hospital-dimension";

import { acuteMyocardialInfarctionAlias } from "./acute-myocardial-infarction";
import { cmsAlias } from "./cms";
import { emergencyDepartmentAlias } from "./emergency-department";
import { hcahpsAlias } from "./hcahps";
import { hospitalOverallRatingAlias } from "./hospital-overall-rating";
import { readmissionAlias } from "./readmission";

import { patientExperienceAlias } from "./patient-experience";
import { emergencyDepartmentVisitsAlias } from "./emergency-department-visits";
import { lengthOfStayAlias } from "./length-of-stay";
import { mortalityRateAlias } from "./mortality-rate";
import { hospitalCountAlias } from "./hospital-count";
import { hospitalListAlias } from "./hospital-list";
import { safetyPerformanceAlias } from "./safety-performance";
import { countyAliases } from "./county";
import { stateDimensionAliases } from "./state-dimension";
import { yearAliases } from "./year";
import { hospitalDimensionAliases } from "./hospital-dimension";

export const healthcareAliases = [
  acuteMyocardialInfarctionAlias,
  cmsAlias,
  emergencyDepartmentAlias,
  hcahpsAlias,
  hospitalOverallRatingAlias,
  readmissionAlias,
  patientExperienceAlias,
emergencyDepartmentVisitsAlias,
lengthOfStayAlias,
mortalityRateAlias,
hospitalCountAlias,
hospitalListAlias,
safetyPerformanceAlias,
countyAliases,
stateDimensionAliases,
yearAliases,
hospitalDimensionAliases,
] as const;