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
}