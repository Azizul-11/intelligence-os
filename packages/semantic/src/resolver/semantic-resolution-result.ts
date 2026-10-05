import type { SemanticType, EntityResolutionResult } from "@intelligence/domain-sdk";

import type { SemanticMatch } from "../candidate/semantic-match";
import type { SemanticCandidate } from "../candidate";
import type { TemporalCandidate } from "../temporal";
export interface SemanticResolutionResult {
  resolved: boolean;

  originalQuery: string;

  normalizedQuery: string;

  canonicalKey: string | null;

  semanticType: SemanticType | null;

  matches: SemanticCandidate[];

  /** RCG-010: natural-language disclosure of a detected direction contradiction ("best and worst"); absent otherwise. */
  ambiguityError?: string;

  /** F5 safety gate: true when a negation/exclusion marker (NEGATORS) appears; detection only, callers must refuse since negation cannot be represented. Absent (not false) when none. */
  unsupportedNegation?: boolean;

  /** Phase 8.1: entity mentions the EntityProvider resolved as "ambiguous"; they still never produce a SemanticCandidate and are never guessed. Absent (not empty) when none. */
  identityAmbiguities?: EntityResolutionResult[];

  /** Batch 4: entity mentions recognised by name but `not_found` in the attached place ("Memorial Hospital in Alabama"), so the request names something nonexistent. Absent (not empty) when none. */
  identityNotFound?: { entityId: string; phrase: string }[];

  /** Phase 8.6A: literal point-year values (e.g. "2021"), separate from `matches` and never registry-looked-up; diagnostic only, no RuntimeEngine gate uses it yet (reserved for 8.6B). Absent (not empty) when none. */
  temporalCandidates?: TemporalCandidate[];
}