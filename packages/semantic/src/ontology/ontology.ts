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

  const semanticType =
    this.registry.getSemanticType(canonicalKey);

  if (!semanticType) {
    return {
      found: false,
      canonicalKey: null,
      semanticType: null,
    };
  }

  let definition;

  switch (semanticType) {
    case "metric":
      definition =
        this.registry.getMetric(canonicalKey);
      break;

    case "entity":
      definition =
        this.registry.getEntity(canonicalKey);
      break;

    case "concept":
      definition =
        this.registry.getConcept(canonicalKey);
      break;

    case "category":
      definition =
        this.registry.getCategory(canonicalKey);
      break;

    case "dimension":
      definition =
        this.registry.getDimension(canonicalKey);
      break;

    case "relationship":
      definition =
        this.registry.getRelationship(canonicalKey);
      break;

    case "benchmark":
      definition =
        this.registry.getBenchmark(canonicalKey);
      break;
  }

  if (!definition) {
  return {
    found: false,
    canonicalKey: null,
    semanticType: null,
  };
}

return {
  found: true,
  canonicalKey,
  semanticType,
  definition,
};
}
}
