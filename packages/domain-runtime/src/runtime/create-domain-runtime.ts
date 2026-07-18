import type { DomainPack } from "@intelligence/domain-sdk";

import type { DomainRuntime } from "./domain-runtime";
import { createSemanticRegistry } from "./create-semantic-registry";

export function createDomainRuntime(
  domain: DomainPack,
): DomainRuntime {
  return {
    domain,
    registry: createSemanticRegistry(domain),
  };
}