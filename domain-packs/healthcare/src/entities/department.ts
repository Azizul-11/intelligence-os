import type { EntityDefinition } from "@intelligence/domain-sdk";
import { organizationCategory } from "./entity-categories";
export const departmentEntity: EntityDefinition = {
  id: "department",
  name: "department",
  displayName: "Department",
  category: organizationCategory,
  description: "Clinical or operational unit within a healthcare organization.",
} as const;