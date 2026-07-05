import type { DomainManifest } from "./domain-manifest";

/**
 * Public contract implemented by every Domain Pack.
 */
export interface DomainPack {
  manifest: DomainManifest;
}