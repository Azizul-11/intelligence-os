export interface AliasResolutionResult {
  matched: boolean;
  canonicalKey: string | null;
  alias: string | null;
}