/** Phase 8.3: one candidate in an ambiguous EntityResolutionResult.candidates list. `value` is opaque; `label` is displayed verbatim. */
export interface AmbiguousCandidate {
  value: unknown;

  label?: string;
}
