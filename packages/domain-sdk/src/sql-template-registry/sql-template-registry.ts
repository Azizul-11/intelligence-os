import type { SqlTemplateDefinition } from "./sql-template-definition";
import type { SqlTemplateRegistration } from "./sql-template-registration";
import type { SqlTemplateRegistryContext } from "./sql-template-registry-context";
import type { SqlTemplateRegistryResult } from "./sql-template-registry-result";

export interface SqlTemplateRegistry {
  register(
    registration: SqlTemplateRegistration,
    context: SqlTemplateRegistryContext,
  ): SqlTemplateRegistryResult;

  get(id: string): SqlTemplateDefinition | undefined;

  list(): SqlTemplateDefinition[];

  has(id: string): boolean;

  remove(id: string): boolean;

  clear(): void;
}