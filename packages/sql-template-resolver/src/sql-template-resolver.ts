import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

import type { SqlTemplateResolutionResult } from "./sql-template-resolution-result";

export class SqlTemplateResolver {
  constructor(
    private readonly templates: readonly SqlTemplateDefinition[],
  ) {}

  resolve(id: string): SqlTemplateResolutionResult {
    const template =
      this.templates.find((t) => t.id === id) ?? null;

    return {
      found: template !== null,
      template,
    };
  }
}