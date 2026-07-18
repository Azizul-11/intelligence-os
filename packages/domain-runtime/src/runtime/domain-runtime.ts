import type { DomainPack } from "@intelligence/domain-sdk";
import type { SemanticRegistry } from "@intelligence/semantic";

export interface DomainRuntime {
  domain: DomainPack;
  registry: SemanticRegistry;
}