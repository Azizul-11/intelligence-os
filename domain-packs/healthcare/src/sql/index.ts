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
export * from "./hospital-overall-rating-by-facility-ids";
export * from "./mortality-rate-by-facility-ids";
export * from "./readmission-rate-by-facility-ids";
export * from "./safety-performance-by-facility-ids";
export * from "./patient-experience-by-facility-ids";
export * from "./hospital-overall-rating-ranking-by-state";
export * from "./hospital-overall-rating-ranking-by-county";
export * from "./hospital-overall-rating-ranking-benchmark";
export * from "./mortality-rate-ranking-benchmark";
export * from "./readmission-rate-ranking-benchmark";
export * from "./safety-performance-ranking-benchmark";
export * from "./hospital-detail";

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
import { hospitalOverallRatingByFacilityIdsSqlTemplate } from "./hospital-overall-rating-by-facility-ids";
import { mortalityRateByFacilityIdsSqlTemplate } from "./mortality-rate-by-facility-ids";
import { readmissionRateByFacilityIdsSqlTemplate } from "./readmission-rate-by-facility-ids";
import { safetyPerformanceByFacilityIdsSqlTemplate } from "./safety-performance-by-facility-ids";
import { patientExperienceByFacilityIdsSqlTemplate } from "./patient-experience-by-facility-ids";
import { hospitalOverallRatingRankingByStateSqlTemplate } from "./hospital-overall-rating-ranking-by-state";
import { hospitalOverallRatingRankingByCountySqlTemplate } from "./hospital-overall-rating-ranking-by-county";
import { hospitalOverallRatingRankingBenchmarkSqlTemplate } from "./hospital-overall-rating-ranking-benchmark";
import { mortalityRateRankingBenchmarkSqlTemplate } from "./mortality-rate-ranking-benchmark";
import { readmissionRateRankingBenchmarkSqlTemplate } from "./readmission-rate-ranking-benchmark";
import { safetyPerformanceRankingBenchmarkSqlTemplate } from "./safety-performance-ranking-benchmark";
import { hospitalDetailSqlTemplate } from "./hospital-detail";

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
    hospitalOverallRatingByFacilityIdsSqlTemplate,
    mortalityRateByFacilityIdsSqlTemplate,
    readmissionRateByFacilityIdsSqlTemplate,
    safetyPerformanceByFacilityIdsSqlTemplate,
    patientExperienceByFacilityIdsSqlTemplate,
    hospitalOverallRatingRankingByStateSqlTemplate,
    hospitalOverallRatingRankingByCountySqlTemplate,
    hospitalOverallRatingRankingBenchmarkSqlTemplate,
    mortalityRateRankingBenchmarkSqlTemplate,
    readmissionRateRankingBenchmarkSqlTemplate,
    safetyPerformanceRankingBenchmarkSqlTemplate,
    hospitalDetailSqlTemplate,
] as const;