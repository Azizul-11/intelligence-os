import type { SemanticType } from "@intelligence/domain-sdk";

export interface SemanticMatch {
  phrase: string;

  canonicalKey: string;

  semanticType: SemanticType;

  confidence: number;

  start: number;

  end: number;
}