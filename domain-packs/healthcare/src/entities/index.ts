export * from "./entity-categories";

export * from "./hospital";
export * from "./provider";
export * from "./department";
export * from "./county";
export * from "./state";
export * from "./cms-facility";

import { hospitalEntity } from "./hospital";
import { providerEntity } from "./provider";
import { departmentEntity } from "./department";
import { countyEntity } from "./county";
import { stateEntity } from "./state";
import { cmsFacilityEntity } from "./cms-facility";

export const healthcareEntities = [
  hospitalEntity,
  providerEntity,
  departmentEntity,
  countyEntity,
  stateEntity,
  cmsFacilityEntity,
] as const;