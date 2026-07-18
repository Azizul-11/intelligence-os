import { SemanticRegistry } from "../registry";
import type { OntologyResult } from "./ontology-result";

export class Ontology {
  constructor(
    private readonly registry: SemanticRegistry,
  ) {}

  resolve(canonicalKey: string | null): OntologyResult {
    if (!canonicalKey) {
      return {
        found: false,
        canonicalKey: null,
      };
    }

    const exists =
      this.registry.hasMetric(canonicalKey) ||
      this.registry.hasEntity(canonicalKey) ||
      this.registry.hasCategory(canonicalKey) ||
      this.registry.hasRelationship(canonicalKey);

    return {
      found: exists,
      canonicalKey: exists ? canonicalKey : null,
    };
  }
}