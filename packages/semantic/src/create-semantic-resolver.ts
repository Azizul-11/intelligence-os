// // import { AliasResolver } from "./alias";
// // import { Matcher } from "./matcher";
// // import { Normalizer } from "./normalizer";
// // import { Ontology } from "./ontology";
// // import { SemanticRegistryBuilder } from "./registry";
// // import { SemanticResolver } from "./resolver";

// // export function createSemanticResolver(): SemanticResolver {
// //   const builder = new SemanticRegistryBuilder();

// //   const registry = builder.build();

// //   return new SemanticResolver(
// //     new Normalizer(),
// //     new AliasResolver(registry.getAliases()),
// //     new Matcher(),
// //     new Ontology(registry),
// //   );
// // }


// import { AliasResolver } from "./alias";
// import { Matcher } from "./matcher";
// import { Normalizer } from "./normalizer";
// import { Ontology } from "./ontology";
// import { SemanticRegistry } from "./registry";
// import { SemanticResolver } from "./resolver";

// export function createSemanticResolver(
//   registry: SemanticRegistry,
// ): SemanticResolver {
//   return new SemanticResolver(
//     new Normalizer(),
//     new AliasResolver(registry.getAliases()),
//     new Matcher(),
//     new Ontology(registry),
//   );
// }


import { AliasResolver } from "./alias";
import { Matcher } from "./matcher";
import { Normalizer } from "./normalizer";
import { Ontology } from "./ontology";

import { SemanticPipeline } from "./pipeline";

import { SemanticRegistry } from "./registry";
import { SemanticResolver } from "./resolver";
import { SemanticAnalyzer } from "./analyzer";
import { PhraseExtractor } from "./phrase";
import { LexicalRewriter } from "./rewriter";
import { SemanticCandidateBuilder } from "./candidate";

export function createSemanticResolver(
  registry: SemanticRegistry,
): SemanticResolver {
  const pipeline = new SemanticPipeline(
  new Normalizer(),
  new SemanticAnalyzer(),
  new LexicalRewriter(),
  new PhraseExtractor(),
 new AliasResolver(registry.getAliases()),
new SemanticCandidateBuilder(),
new Matcher(),
  new Ontology(registry),
);

  return new SemanticResolver(pipeline);
}