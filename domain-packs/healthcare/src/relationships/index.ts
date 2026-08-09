export * from "./hospital-has-department";
export * from "./department-belongs-to-hospital";
export * from "./provider-works-in-department";
export * from "./hospital-reports-metric";
export * from "./county-contains-hospital";
export * from "./cms-facility-maps-to-hospital";
export * from "./above-comparison";
export * from "./below-comparison";

import { hospitalHasDepartmentRelationship } from "./hospital-has-department";
import { departmentBelongsToHospitalRelationship } from "./department-belongs-to-hospital";
import { providerWorksInDepartmentRelationship } from "./provider-works-in-department";
import { hospitalReportsMetricRelationship } from "./hospital-reports-metric";
import { countyContainsHospitalRelationship } from "./county-contains-hospital";
import { cmsFacilityMapsToHospitalRelationship } from "./cms-facility-maps-to-hospital";
import { aboveComparisonRelationship } from "./above-comparison";
import { belowComparisonRelationship } from "./below-comparison";

export const healthcareRelationships = [
  hospitalHasDepartmentRelationship,
  departmentBelongsToHospitalRelationship,
  providerWorksInDepartmentRelationship,
  hospitalReportsMetricRelationship,
  countyContainsHospitalRelationship,
  cmsFacilityMapsToHospitalRelationship,
  aboveComparisonRelationship,
  belowComparisonRelationship,
] as const;