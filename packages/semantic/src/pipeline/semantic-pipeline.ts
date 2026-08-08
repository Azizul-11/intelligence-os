import { AliasResolver } from "../alias";
import { Matcher } from "../matcher";
import { Normalizer } from "../normalizer";
import { Ontology } from "../ontology";

import type { SemanticResolutionResult } from "../resolver";

import { SemanticAnalyzer } from "../analyzer";

import { PhraseExtractor } from "../phrase";

import { LexicalRewriter } from "../rewriter";

import { SemanticCandidateBuilder } from "../candidate";

import type { SemanticCandidate } from "../candidate";
import { EntityResolver } from "../entity";
export class SemanticPipeline {
  constructor(
    private readonly normalizer: Normalizer,
    private readonly analyzer: SemanticAnalyzer,
    private readonly lexicalRewriter: LexicalRewriter,
    private readonly phraseExtractor: PhraseExtractor,
    private readonly aliasResolver: AliasResolver,
    private readonly entityResolver: EntityResolver,
    private readonly candidateBuilder: SemanticCandidateBuilder,
    private readonly matcher: Matcher,
    private readonly ontology: Ontology,
  ) {}
  resolve(query: string): SemanticResolutionResult {
    console.log("🔥 NEW SEMANTIC PIPELINE V2 🔥");
    const normalizedQuery = this.normalizer.normalize(query);

    console.log("========== SEMANTIC ==========");
    console.log("Original :", query);
    console.log("Normalized :", normalizedQuery);

    const analyzed = this.analyzer.analyze(normalizedQuery);

    console.log("Analyzed Tokens:");

    for (const token of analyzed) {
      console.log(token.token.value, "→", token.role);
    }

    const rewritten = this.lexicalRewriter.rewrite(normalizedQuery);

    console.log("Rewritten:");
    console.log(rewritten.rewritten);

    const rewrittenTokens = rewritten.rewritten
      .split(" ")
      .filter(Boolean)
      .map((value, position) => ({
        value,
        position,
      }));

    const phrases = this.phraseExtractor.extract(rewrittenTokens);

    console.log("Phrases:");

    for (const phrase of phrases) {
      console.log("-", phrase.value);
    }

    const semanticCandidates: SemanticCandidate[] = [];

    for (const phrase of phrases) {
      const aliasResult = this.aliasResolver.resolve(phrase.value);

      if (aliasResult.matched) {
        const ontologyResult = this.ontology.resolve(aliasResult.canonicalKey);

        if (ontologyResult.found) {
          semanticCandidates.push(
            this.candidateBuilder.build(
              phrase.value,
              ontologyResult.canonicalKey!,
              ontologyResult.semanticType!,
              ontologyResult.definition!,
              1,
            ),
          );
        }

        continue;
      }

      const entity = this.entityResolver.resolve(phrase.value);

      if (!entity.found) {
        continue;
      }

      const ontologyResult = this.ontology.resolve(entity.entityId);

      if (!ontologyResult.found) {
        continue;
      }

      const candidate = this.candidateBuilder.build(
        phrase.value,
        ontologyResult.canonicalKey!,
        ontologyResult.semanticType!,
        ontologyResult.definition!,
        1,
      );

      candidate.resolvedValue = entity.value;

      semanticCandidates.push(candidate);
    }

    // console.log("Semantic Candidates");
    // console.log(semanticCandidates);

    console.log("========== SEMANTIC CANDIDATES ==========");

    for (const candidate of semanticCandidates) {
      console.log({
        phrase: candidate.phrase,
        canonical: candidate.canonicalKey,
        type: candidate.semanticType,
      });
    }

    console.log("=========================================");

    for (const candidate of semanticCandidates) {
      console.dir(candidate, { depth: null });
    }

    console.log(JSON.stringify(semanticCandidates, null, 2));

    const matchResult = this.matcher.match(
      semanticCandidates.map((candidate) => candidate.canonicalKey),
    );

    const ontologyResult = this.ontology.resolve(matchResult.canonicalKey);

    // const aliasResult = this.aliasResolver.resolve(rewritten.rewritten);
    // const candidates = aliasResult.canonicalKey
    //   ? [aliasResult.canonicalKey]
    //   : [];

    // const matchResult = this.matcher.match(candidates);

    // const ontologyResult = this.ontology.resolve(matchResult.canonicalKey);

    return {
      resolved: ontologyResult.found,
      originalQuery: query,
      normalizedQuery,
      canonicalKey: ontologyResult.canonicalKey,
      semanticType: ontologyResult.semanticType,
      matches: semanticCandidates,
    };
  }
}
