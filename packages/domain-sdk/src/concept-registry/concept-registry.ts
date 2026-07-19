import type { ConceptDefinition } from "./concept-definition";
import type { ConceptRegistration } from "./concept-registration";
import type { ConceptRegistryResult } from "./concept-registry-result";

/**
 * Public API implemented by every Domain Pack.
 */
export interface ConceptRegistry {
  register(
    registration: ConceptRegistration,
  ): ConceptRegistryResult;

  unregister(
    id: string,
  ): ConceptRegistryResult;

  get(
    id: string,
  ): ConceptDefinition | undefined;

  getAll(): ConceptDefinition[];
}