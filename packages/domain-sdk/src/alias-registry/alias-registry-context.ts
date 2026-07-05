import type { DomainManifest } from "../contracts";

export interface AliasRegistryContext {
  /**
   * Domain currently being registered.
   */
  domain: DomainManifest;
}