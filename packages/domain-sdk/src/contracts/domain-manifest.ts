// import type { DomainCapability } from "./domain-capability";
// import type { DomainConfiguration } from "./domain-configuration";
// import type { DomainMetadata } from "./domain-metadata";
// import type { DomainVersion } from "./domain-version";

// /**
//  * Entry point describing a Domain Pack.
//  */
// export interface DomainManifest {
//   metadata: DomainMetadata;

//   version: DomainVersion;

//   configuration: DomainConfiguration;

//   capabilities: DomainCapability[];
// }


import type { DomainConfiguration } from "./domain-configuration";
import type { DomainMetadata } from "./domain-metadata";

/**
 * Describes a Domain Pack.
 */
export interface DomainManifest {
  metadata: DomainMetadata;

  configuration: DomainConfiguration;
}