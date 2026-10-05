/** Phase 8.6A: a literal temporal value, separate from SemanticCandidate (no SemanticDefinition, no registry lookup); carries only the value and its position. */
export interface TemporalSpan {
  start: number;

  end: number;
}

export interface TemporalCandidate {
  kind: "year";

  value: number;

  span: TemporalSpan;
}
