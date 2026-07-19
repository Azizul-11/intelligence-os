import type { ConceptDefinition } from "./concept-definition";

/**
 * Registers a concept with the Domain Registry.
 */
export interface ConceptRegistration {
  concept: ConceptDefinition;

  enabled: boolean;
}