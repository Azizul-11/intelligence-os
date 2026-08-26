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
export * from "./national-average";
export * from "./state-average";
export * from "./average";
export * from "./above-comparison";
export * from "./below-comparison";
export * from "./quality";
export * from "./safety";
export * from "./operations";
export * from "./experience";
export * from "./clinical-outcomes";
export * from "./hospital-detail";

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
import { nationalAverageAliases } from "./national-average";
import { stateAverageAliases } from "./state-average";
import { averageAliases } from "./average";
import { aboveComparisonAliases } from "./above-comparison";
import { belowComparisonAliases } from "./below-comparison";
import { qualityAliases } from "./quality";
import { safetyAliases } from "./safety";
import { operationsAliases } from "./operations";
import { experienceAliases } from "./experience";
import { clinicalOutcomesAliases } from "./clinical-outcomes";
import { hospitalDetailAlias } from "./hospital-detail";

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
  nationalAverageAliases,
  stateAverageAliases,
  averageAliases,
  aboveComparisonAliases,
  belowComparisonAliases,
  qualityAliases,
  safetyAliases,
  operationsAliases,
  experienceAliases,
  clinicalOutcomesAliases,
  hospitalDetailAlias,
] as const;
