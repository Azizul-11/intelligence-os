import type { SemanticType, EntityResolutionResult } from "@intelligence/domain-sdk";

import type { SemanticMatch } from "../candidate/semantic-match";
import type { SemanticCandidate } from "../candidate";
export interface SemanticResolutionResult {
  resolved: boolean;

  originalQuery: string;

  normalizedQuery: string;

  canonicalKey: string | null;

  semanticType: SemanticType | null;

  matches: SemanticCandidate[];

  /**
   * RCG-010: a natural-language disclosure of a detected direction
   * contradiction (e.g. "best and worst" both applied to the same
   * metric), set only when SemanticPipeline detects one. Domain-
   * agnostic - never contains a domain-specific noun, only the user's
   * own modifier words. Absent for every ordinary, unambiguous query.
   */
  ambiguityError?: string;

  /**
   * F5 safety gate: true when the query contains a recognized negation/
   * exclusion marker (see NEGATORS in analyzer/lexicon.ts) anywhere in
   * the original text. Detection only - this never identifies WHAT is
   * negated or attempts to represent negation in any candidate or
   * filter. Callers must treat this as a signal to refuse the request
   * honestly rather than execute it, since no downstream mechanism can
   * safely represent negation/exclusion today. Absent (not merely
   * false) for every query with no negation marker present.
   */
  unsupportedNegation?: boolean;

  /**
   * Phase 8.1: entity mentions that a Domain SDK's EntityProvider resolved
   * as `status: "ambiguous"` (more than one legitimate candidate identity,
   * none silently chosen) rather than `"unique"` or `"not_found"`. Reuses
   * the existing, already-generic EntityResolutionResult shape verbatim -
   * no new domain-agnostic type was introduced for this.
   *
   * Before Phase 8.1, this information was discarded at the exact point
   * SemanticPipeline.resolve() decided whether to build a SemanticCandidate
   * for a phrase (an ambiguous and a not-found entity were treated
   * identically - both simply produced no candidate). This field preserves
   * the distinction without changing that underlying behavior: an ambiguous
   * mention still never produces a SemanticCandidate and is never guessed.
   * Absent (not merely an empty array) when no entity mention in the query
   * was ambiguous.
   */
  identityAmbiguities?: EntityResolutionResult[];
}