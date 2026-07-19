import type { SemanticType } from "@intelligence/domain-sdk";

export interface OntologyResult {
  found: boolean;

  canonicalKey: string | null;

  semanticType: SemanticType | null;
}