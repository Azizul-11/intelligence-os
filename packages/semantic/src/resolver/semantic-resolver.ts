

//   resolve(query: string): SemanticResolutionResult {
//     const normalizedQuery = this.normalizer.normalize(query);


//     const aliasResult = this.aliasResolver.resolve(normalizedQuery);


//     const matchResult = this.matcher.match(candidates);
//     const ontologyResult = this.ontology.resolve(matchResult.canonicalKey);




import { SemanticPipeline } from "../pipeline";

import type { SemanticResolutionResult } from "./semantic-resolution-result";

export class SemanticResolver {
  constructor(
    private readonly pipeline: SemanticPipeline,
  ) {}

  resolve(
    query: string,
  ): SemanticResolutionResult {
    return this.pipeline.resolve(query);
  }
}