import { AliasResolver } from "../alias";
import { Matcher } from "../matcher";
import { Normalizer } from "../normalizer";
import { Ontology } from "../ontology";

import type { SemanticResolutionResult } from "../resolver";

import { SemanticAnalyzer } from "../analyzer";

import { PhraseExtractor } from "../phrase";

import { LexicalRewriter } from "../rewriter";

export class SemanticPipeline {
constructor(
  private readonly normalizer: Normalizer,
  private readonly analyzer: SemanticAnalyzer,
  private readonly lexicalRewriter: LexicalRewriter,
  private readonly phraseExtractor: PhraseExtractor,
  private readonly aliasResolver: AliasResolver,
  private readonly matcher: Matcher,
  private readonly ontology: Ontology,
) {}
  resolve(query: string): SemanticResolutionResult {
    const normalizedQuery =
      this.normalizer.normalize(query);

    console.log("========== SEMANTIC ==========");
    console.log("Original :", query);
    console.log("Normalized :", normalizedQuery);

    const analyzed =
  this.analyzer.analyze(normalizedQuery);

console.log("Analyzed Tokens:");

for (const token of analyzed) {
  console.log(
    token.token.value,
    "→",
    token.role,
  );
}

const rewritten =
  this.lexicalRewriter.rewrite(
    normalizedQuery,
  );

console.log("Rewritten:");
console.log(rewritten.rewritten);

const rewrittenTokens =
  rewritten.rewritten
    .split(" ")
    .filter(Boolean)
    .map((value, position) => ({
      value,
      position,
    }));

const phrases =
  this.phraseExtractor.extract(
    rewrittenTokens,
  );

console.log("Phrases:");

for (const phrase of phrases) {
  console.log("-", phrase.value);
}

   const aliasResult =
  this.aliasResolver.resolve(
    rewritten.rewritten,
  );
    const candidates =
      aliasResult.canonicalKey
        ? [aliasResult.canonicalKey]
        : [];

    const matchResult =
      this.matcher.match(candidates);

    const ontologyResult =
      this.ontology.resolve(
        matchResult.canonicalKey,
      );

      
    return {
      resolved: ontologyResult.found,
      originalQuery: query,
      normalizedQuery,
      canonicalKey:
        ontologyResult.canonicalKey,
      semanticType:
        ontologyResult.semanticType,
    };
  }
}