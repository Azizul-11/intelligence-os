/** Describes a Domain Pack. */
import type { DomainConfiguration } from "./domain-configuration";
import type { DomainMetadata } from "./domain-metadata";

export interface DomainManifest {
  metadata: DomainMetadata;

  configuration: DomainConfiguration;
}