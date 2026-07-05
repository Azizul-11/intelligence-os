import type { SqlTemplateParameter } from "./sql-template-parameter";
import type { SqlTemplateType } from "./sql-template-type";

export interface SqlTemplateDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  template: string;

  type: SqlTemplateType;

  parameters?: SqlTemplateParameter[];

  deterministic?: boolean;

  enabled?: boolean;
}