export * from "./entity-categories";

export * from "./hospital";
export * from "./provider";
export * from "./department";
export * from "./county";
export * from "./city";
export * from "./state";
export * from "./cms-facility";
export * from "./ownership";
export * from "./star-rating";
export * from "./hospital-type";
export * from "./emergency-services";
export * from "./birthing-friendly";

import { hospitalEntity } from "./hospital";
import { providerEntity } from "./provider";
import { departmentEntity } from "./department";
import { countyEntity } from "./county";
import { cityEntity } from "./city";
import { stateEntity } from "./state";
import { cmsFacilityEntity } from "./cms-facility";
import { ownershipEntity } from "./ownership";
import { starRatingEntity } from "./star-rating";
import { hospitalTypeEntity } from "./hospital-type";
import { emergencyServicesEntity } from "./emergency-services";
import { birthingFriendlyEntity } from "./birthing-friendly";

export const healthcareEntities = [
  hospitalEntity,
  providerEntity,
  departmentEntity,
  countyEntity,
  cityEntity,
  stateEntity,
  cmsFacilityEntity,
  ownershipEntity,
  starRatingEntity,
  hospitalTypeEntity,
  emergencyServicesEntity,
  birthingFriendlyEntity,
] as const;