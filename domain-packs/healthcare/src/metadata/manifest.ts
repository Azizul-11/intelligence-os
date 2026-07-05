import type { DomainManifest } from "@intelligence/domain-sdk";

import { healthcareMetadata } from "./domain";

export const healthcareManifest: DomainManifest = {
  metadata: healthcareMetadata,

  configuration: {
    enabled: true,
    strictMode: true,
    cacheEnabled: true,
    experimental: false,
    defaultLocale: "en-US",
  },
};