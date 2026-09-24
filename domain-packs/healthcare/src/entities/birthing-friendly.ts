import type { EntityDefinition } from "@intelligence/domain-sdk";
import { organizationCategory } from "./entity-categories";

export const birthingFriendlyEntity: EntityDefinition = {
  id: "birthing-friendly",

  name: "birthing-friendly",

  displayName: "Birthing Friendly",

  category: organizationCategory,

  description:
    "Batch 5B-4: CMS Birthing-Friendly designation, used for filtering.",

  execution: {
    parameter: "birthingFriendly",
  },
} as const;
