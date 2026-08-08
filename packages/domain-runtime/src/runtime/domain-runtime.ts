import type { DomainPack } from "@intelligence/domain-sdk";
import type { SemanticRegistry } from "@intelligence/semantic";
import type { SqlTemplateResolver } from "@intelligence/sql-template-resolver";

import type { EntityProvider } from "@intelligence/domain-sdk";

export interface DomainRuntime {
  domain: DomainPack;

  registry: SemanticRegistry;

  sqlResolver: SqlTemplateResolver;

  entityProvider: EntityProvider;
}