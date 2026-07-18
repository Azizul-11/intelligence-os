import type { SemanticResolutionResult } from "./semantic-resolution-result";

export class SemanticResolver {
  resolve(): SemanticResolutionResult {
    return {
      resolved: false,
      canonicalKey: null,
    };
  }
}