/** A canonical semantic object resolved by the platform. */
import type { SemanticType } from "./semantic-type";

export interface SemanticReference {
  canonicalKey: string;

  semanticType: SemanticType;
}