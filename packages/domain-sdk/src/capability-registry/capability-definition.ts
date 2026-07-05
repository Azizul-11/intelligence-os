import type { DomainVersion } from "../contracts";

import type { CapabilityCategory } from "./capability-category";

export interface CapabilityDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  category?: CapabilityCategory;

  version?: DomainVersion;

  enabled?: boolean;
}