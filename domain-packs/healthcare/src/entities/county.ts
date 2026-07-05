import type { EntityDefinition } from "@intelligence/domain-sdk";
import { locationCategory } from "./entity-categories";
export const countyEntity: EntityDefinition = {
  id: "county",
  name: "county",
  displayName: "County",
  category: locationCategory,
  description: "Administrative geographic region used for healthcare reporting.",
} as const;