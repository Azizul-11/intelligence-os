import type { EntityDefinition } from "@intelligence/domain-sdk";
import { organizationCategory } from "./entity-categories";
export const cmsFacilityEntity: EntityDefinition = {
  id: "cms-facility",
  name: "cms-facility",
  displayName: "CMS Facility",
  category: organizationCategory,
  description: "Facility registered within the Centers for Medicare & Medicaid Services datasets.",
  execution: {
  parameter: "facility",
},
} as const;