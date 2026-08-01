import type { SemanticType } from "@intelligence/domain-sdk";

export interface SemanticCandidate {
  /**
   * Original phrase extracted from the query.
   */
  phrase: string;

  /**
   * Canonical registry key.
   */
  canonicalKey: string;

  /**
   * Semantic classification.
   */
  semanticType: SemanticType;

  /**
   * Confidence score.
   * 0.0 - 1.0
   */
  confidence: number;

  /**
   * Phrase start token index.
   */
  start: number;

  /**
   * Phrase end token index.
   */
  end: number;
}