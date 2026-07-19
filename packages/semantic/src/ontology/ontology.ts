import { SemanticRegistry } from "../registry";
import type { OntologyResult } from "./ontology-result";

export class Ontology {
  constructor(private readonly registry: SemanticRegistry) {}

  resolve(canonicalKey: string | null): OntologyResult {
    if (!canonicalKey) {
      return {
        found: false,
        canonicalKey: null,
        semanticType: null,
      };
    }

    // const exists =
    //   this.registry.hasMetric(canonicalKey) ||
    //   this.registry.hasEntity(canonicalKey) ||
    //   this.registry.hasCategory(canonicalKey) ||
    //   this.registry.hasRelationship(canonicalKey);

    const semanticType = this.registry.getSemanticType(canonicalKey);

    return {
      found: semanticType !== null,
      canonicalKey: semanticType ? canonicalKey : null,
      semanticType,
    };
  }
}
