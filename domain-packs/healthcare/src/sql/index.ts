export * from "./hospital-overall-rating";
export * from "./mortality-rate";
export * from "./readmission-rate";
export * from "./emergency-department-visits";
export * from "./patient-experience";
export * from "./length-of-stay";


import { hospitalOverallRatingSqlTemplate } from "./hospital-overall-rating";
import { mortalityRateSqlTemplate } from "./mortality-rate";
import { readmissionRateSqlTemplate } from "./readmission-rate";
import { emergencyDepartmentVisitsSqlTemplate } from "./emergency-department-visits";
import { patientExperienceSqlTemplate } from "./patient-experience";
import { lengthOfStaySqlTemplate } from "./length-of-stay";

export const healthcareSqlTemplates = [
    hospitalOverallRatingSqlTemplate,
    mortalityRateSqlTemplate,
    readmissionRateSqlTemplate,
    emergencyDepartmentVisitsSqlTemplate,
    patientExperienceSqlTemplate,
    lengthOfStaySqlTemplate,
] as const;