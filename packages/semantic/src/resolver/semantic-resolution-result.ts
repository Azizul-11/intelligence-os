export interface SemanticResolutionResult {
  resolved: boolean;

  originalQuery: string;

  normalizedQuery: string;

  canonicalKey: string | null;
}