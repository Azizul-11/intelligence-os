export * from "./hospital-overall-rating";
export * from "./mortality-rate";
export * from "./readmission-rate";
export * from "./emergency-department-visits";
export * from "./patient-experience";
export * from "./length-of-stay";
export * from "./hospital-overall-rating-ranking";

import { hospitalOverallRatingSqlTemplate } from "./hospital-overall-rating";
import { mortalityRateSqlTemplate } from "./mortality-rate";
import { readmissionRateSqlTemplate } from "./readmission-rate";
import { emergencyDepartmentVisitsSqlTemplate } from "./emergency-department-visits";
import { patientExperienceSqlTemplate } from "./patient-experience";
import { lengthOfStaySqlTemplate } from "./length-of-stay";
import { hospitalOverallRatingRankingSqlTemplate }
from "./hospital-overall-rating-ranking";

export const healthcareSqlTemplates = [
    hospitalOverallRatingSqlTemplate,
    hospitalOverallRatingRankingSqlTemplate,
    mortalityRateSqlTemplate,
    readmissionRateSqlTemplate,
    emergencyDepartmentVisitsSqlTemplate,
    patientExperienceSqlTemplate,
    lengthOfStaySqlTemplate,
] as const;