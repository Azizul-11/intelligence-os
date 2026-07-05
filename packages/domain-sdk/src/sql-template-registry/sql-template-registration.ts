import type { SqlTemplateDefinition } from "./sql-template-definition";

export interface SqlTemplateRegistration {
  template: SqlTemplateDefinition;

  overwrite?: boolean;
}