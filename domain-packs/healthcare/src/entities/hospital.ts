import type { EntityDefinition } from "@intelligence/domain-sdk";
import { organizationCategory } from "./entity-categories";

export const hospitalEntity: EntityDefinition = {
  id: "hospital",
  name: "hospital",
  displayName: "Hospital",
  category: organizationCategory,
  description:
    "Healthcare organization providing inpatient and outpatient services.",
    execution: {
  parameter: "hospital",
},
  // Tier0 Task 5 (F12 Sub-Task A): a hospital identifies one specific
  // facility, never a scope-only filter - see EntityDefinition.identifiesUniqueRecord.
  identifiesUniqueRecord: true,
};