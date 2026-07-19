import type { SemanticType } from "./semantic-type";

/**
 * A canonical semantic object resolved by the platform.
 */
export interface SemanticReference {
  canonicalKey: string;

  semanticType: SemanticType;
}