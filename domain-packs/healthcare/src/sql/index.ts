export * from "./hospital-overall-rating";
export * from "./mortality-rate";
export * from "./mortality-rate-ranking";
export * from "./readmission-rate";
export * from "./readmission-rate-ranking";
export * from "./emergency-department-visits";
export * from "./patient-experience";
export * from "./patient-experience-ranking";
export * from "./length-of-stay";
export * from "./hospital-overall-rating-ranking";
export * from "./hospital-count-by-state";
export * from "./hospital-list-by-state";
export * from "./hospital-list-by-ownership";
export * from "./safety-performance-ranking";

import { hospitalOverallRatingSqlTemplate } from "./hospital-overall-rating";
import { mortalityRateSqlTemplate } from "./mortality-rate";
import { mortalityRateRankingSqlTemplate } from "./mortality-rate-ranking";
import { readmissionRateSqlTemplate } from "./readmission-rate";
import { readmissionRateRankingSqlTemplate } from "./readmission-rate-ranking";
import { emergencyDepartmentVisitsSqlTemplate } from "./emergency-department-visits";
import { patientExperienceSqlTemplate } from "./patient-experience";
import { patientExperienceRankingSqlTemplate } from "./patient-experience-ranking";
import { lengthOfStaySqlTemplate } from "./length-of-stay";
import { hospitalOverallRatingRankingSqlTemplate }
from "./hospital-overall-rating-ranking";
import { hospitalCountByStateSqlTemplate } from "./hospital-count-by-state";
import { hospitalListByStateSqlTemplate } from "./hospital-list-by-state";
import { hospitalListByOwnershipSqlTemplate } from "./hospital-list-by-ownership";
import { safetyPerformanceRankingSqlTemplate } from "./safety-performance-ranking";

export const healthcareSqlTemplates = [
    hospitalOverallRatingSqlTemplate,
    hospitalOverallRatingRankingSqlTemplate,
    mortalityRateSqlTemplate,
    mortalityRateRankingSqlTemplate,
    readmissionRateSqlTemplate,
    readmissionRateRankingSqlTemplate,
    emergencyDepartmentVisitsSqlTemplate,
    patientExperienceSqlTemplate,
    patientExperienceRankingSqlTemplate,
    lengthOfStaySqlTemplate,
    hospitalCountByStateSqlTemplate,
    hospitalListByStateSqlTemplate,
    hospitalListByOwnershipSqlTemplate,
    safetyPerformanceRankingSqlTemplate,
] as const;