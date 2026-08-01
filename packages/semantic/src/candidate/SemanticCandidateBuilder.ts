import type { SemanticType } from "@intelligence/domain-sdk";

import type { SemanticCandidate } from "./SemanticCandidate";

export class SemanticCandidateBuilder {
  build(
    phrase: string,
    canonicalKey: string,
    semanticType: SemanticType,
    confidence = 1,
  ): SemanticCandidate {
    return {
      phrase,
      canonicalKey,
      semanticType,
      confidence,
      start: 0,
      end: 0,
    };
  }
}