import type { EntityDefinition } from "@intelligence/domain-sdk";
import { organizationCategory } from "./entity-categories";

export const hospitalEntity: EntityDefinition = {
  id: "hospital",
  name: "hospital",
  displayName: "Hospital",
  category: organizationCategory,
  description:
    "Healthcare organization providing inpatient and outpatient services.",
};