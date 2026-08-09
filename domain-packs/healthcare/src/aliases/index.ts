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
] as const;