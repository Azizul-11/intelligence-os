import type { EntityDefinition } from "@intelligence/domain-sdk";
import { personCategory } from "./entity-categories";
export const providerEntity: EntityDefinition = {
  id: "provider",
  name: "provider",
  displayName: "Provider",
  category: personCategory,
  description: "Licensed healthcare professional delivering medical services.",
} as const;