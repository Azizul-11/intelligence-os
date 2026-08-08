import type { DomainPack } from "@intelligence/domain-sdk";

import type { DomainRuntime } from "./domain-runtime";
import { createSemanticRegistry } from "./create-semantic-registry";
import { SqlTemplateResolver } from "@intelligence/sql-template-resolver";

export function createDomainRuntime(
  domain: DomainPack,
): DomainRuntime {
  return {
    domain,

    registry: createSemanticRegistry(domain),

    sqlResolver: new SqlTemplateResolver(
      domain.sqlTemplates,
    ),
    entityProvider: domain.entityProvider,
  };
}