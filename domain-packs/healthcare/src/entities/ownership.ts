import type { EntityDefinition } from "@intelligence/domain-sdk";
import { organizationCategory } from "./entity-categories";

export const ownershipEntity: EntityDefinition = {
  id: "ownership",

  name: "ownership",

  displayName: "Ownership",

  category: organizationCategory,

  description:
    "Hospital ownership/control category (e.g. non-profit, government, proprietary) used for filtering.",

  execution: {
    parameter: "ownership",
  },
} as const;
