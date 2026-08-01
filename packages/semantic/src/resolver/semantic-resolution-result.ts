import type { SemanticType } from "@intelligence/domain-sdk";

import type { SemanticMatch } from "../candidate/semantic-match";
import type { SemanticCandidate } from "../candidate";
export interface SemanticResolutionResult {
  resolved: boolean;

  originalQuery: string;

  normalizedQuery: string;

  canonicalKey: string | null;

  semanticType: SemanticType | null;

  matches: SemanticCandidate[];
}