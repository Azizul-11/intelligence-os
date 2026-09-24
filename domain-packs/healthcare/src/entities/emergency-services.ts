import type { EntityDefinition } from "@intelligence/domain-sdk";
import { organizationCategory } from "./entity-categories";

export const emergencyServicesEntity: EntityDefinition = {
  id: "emergency-services",

  name: "emergency-services",

  displayName: "Emergency Services",

  category: organizationCategory,

  description:
    "Batch 5B-4: whether a hospital provides emergency services, used for filtering.",

  execution: {
    parameter: "emergencyServices",
  },
} as const;
