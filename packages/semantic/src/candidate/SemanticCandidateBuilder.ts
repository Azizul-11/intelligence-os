import type { SemanticType } from "@intelligence/domain-sdk";

import type {
  SemanticCandidate,
  SemanticDefinition,
} from "./SemanticCandidate";

export class SemanticCandidateBuilder {
  build(
  phrase: string,
  canonicalKey: string,
  semanticType: SemanticType,
  definition: SemanticDefinition,
  confidence = 1,
  start = 0,
  end = 0,
): SemanticCandidate {
    return {
      phrase,
      canonicalKey,
      semanticType,
      definition,
      confidence,
      start,
      end,
    };
  }
}