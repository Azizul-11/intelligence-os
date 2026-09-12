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

import { hospitalEntity } from "./hospital";
import { providerEntity } from "./provider";
import { departmentEntity } from "./department";
import { countyEntity } from "./county";
import { cityEntity } from "./city";
import { stateEntity } from "./state";
import { cmsFacilityEntity } from "./cms-facility";
import { ownershipEntity } from "./ownership";
import { starRatingEntity } from "./star-rating";

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
] as const;