import type { EntityDefinition } from "@intelligence/domain-sdk";
import { organizationCategory } from "./entity-categories";

export const hospitalTypeEntity: EntityDefinition = {
  id: "hospital-type",

  name: "hospital-type",

  displayName: "Hospital Type",

  category: organizationCategory,

  description:
    "Batch 5B-4: CMS hospital type (acute care, critical access, children's, psychiatric, rural emergency) used for filtering, as a SQL LIKE pattern.",

  execution: {
    parameter: "hospitalType",
  },
} as const;
