/** Context passed to AliasRegistry.register(). */
import type { DomainManifest } from "../contracts";

export interface AliasRegistryContext {
  domain: DomainManifest;
}