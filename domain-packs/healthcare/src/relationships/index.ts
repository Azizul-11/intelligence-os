export * from "./hospital-has-department";
export * from "./department-belongs-to-hospital";
export * from "./provider-works-in-department";
export * from "./hospital-reports-metric";
export * from "./county-contains-hospital";
export * from "./cms-facility-maps-to-hospital";

import { hospitalHasDepartmentRelationship } from "./hospital-has-department";
import { departmentBelongsToHospitalRelationship } from "./department-belongs-to-hospital";
import { providerWorksInDepartmentRelationship } from "./provider-works-in-department";
import { hospitalReportsMetricRelationship } from "./hospital-reports-metric";
import { countyContainsHospitalRelationship } from "./county-contains-hospital";
import { cmsFacilityMapsToHospitalRelationship } from "./cms-facility-maps-to-hospital";

export const healthcareRelationships = [
  hospitalHasDepartmentRelationship,
  departmentBelongsToHospitalRelationship,
  providerWorksInDepartmentRelationship,
  hospitalReportsMetricRelationship,
  countyContainsHospitalRelationship,
  cmsFacilityMapsToHospitalRelationship,
] as const;