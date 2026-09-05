/**
 * Phase 8.6A: a literal temporal value recognized in the query, kept
 * entirely separate from `SemanticCandidate` - a literal year has no
 * Domain-registered `SemanticDefinition` and is never looked up in any
 * registry (see TemporalResolver). Universal and domain-agnostic: this
 * type never carries a canonical id, SQL, or any Domain-specific
 * meaning - only the recognized value and its original position.
 */
export interface TemporalSpan {
  start: number;

  end: number;
}

export interface TemporalCandidate {
  kind: "year";

  value: number;

  span: TemporalSpan;
}
