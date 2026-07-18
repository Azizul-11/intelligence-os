import { AliasResolver } from "../alias";
import { Matcher } from "../matcher";
import { Normalizer } from "../normalizer";
import { Ontology } from "../ontology";
import type { SemanticResolutionResult } from "./semantic-resolution-result";

export class SemanticResolver {
  constructor(
    private readonly normalizer: Normalizer,
    private readonly aliasResolver: AliasResolver,
    private readonly matcher: Matcher,
    private readonly ontology: Ontology,
  ) {}

  resolve(query: string): SemanticResolutionResult {
    const normalizedQuery = this.normalizer.normalize(query);

    const aliasResult = this.aliasResolver.resolve(normalizedQuery);

    const candidates = aliasResult.canonicalKey
      ? [aliasResult.canonicalKey]
      : [];

    const matchResult = this.matcher.match(candidates);
    const ontologyResult = this.ontology.resolve(matchResult.canonicalKey);

    return {
      resolved: ontologyResult.found,
      originalQuery: query,
      normalizedQuery,
      canonicalKey: ontologyResult.canonicalKey,
    };
  }
}
