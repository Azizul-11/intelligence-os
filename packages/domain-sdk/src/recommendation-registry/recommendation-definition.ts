import type { DomainVersion } from "../contracts";

import type { RecommendationPriority } from "./recommendation-priority";

export interface RecommendationDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  priority?: RecommendationPriority;

  capabilityId?: string;

  version?: DomainVersion;

  enabled?: boolean;
}