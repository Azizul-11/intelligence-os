import type { EntityDefinition } from "@intelligence/domain-sdk";
import { locationCategory } from "./entity-categories";
export const cityEntity: EntityDefinition = {
  id: "city",
  name: "city",
  displayName: "City",
  category: locationCategory,
  description: "City used in healthcare reporting.",
  execution: {
  parameter: "city",
},
} as const;
