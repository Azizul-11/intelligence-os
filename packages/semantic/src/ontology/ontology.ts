import type { OntologyResult } from "./ontology-result";

export class Ontology {
  resolve(canonicalKey: string | null): OntologyResult {
    if (!canonicalKey) {
      return {
        found: false,
        canonicalKey: null,
      };
    }

    return {
      found: true,
      canonicalKey,
    };
  }
}