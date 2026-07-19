import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export interface SqlTemplateResolutionResult {
  found: boolean;

  template: SqlTemplateDefinition | null;
}