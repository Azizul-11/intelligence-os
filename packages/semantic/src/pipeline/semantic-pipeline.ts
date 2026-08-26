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
import { ModifierDirectionResolver } from "../direction";
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
    private readonly directionResolver: ModifierDirectionResolver,
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

    let semanticCandidates: SemanticCandidate[] = [];

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
              phrase.start,
              phrase.end,
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
        phrase.start,
        phrase.end,
      );

      candidate.resolvedValue = entity.value;

      semanticCandidates.push(candidate);
    }

    // F4: suppress spurious entity sub-spans. PhraseExtractor generates
    // every possible contiguous sub-span, so a genuine full mention
    // (e.g. "mayo clinic hospital") and a shorter sub-span sharing part
    // of the same text (e.g. "mayo clinic") can each independently
    // resolve to a real, but different, entity. A contained span is
    // never a separate user mention - it's an artifact of exhaustive
    // extraction - so it is dropped in favor of the larger match that
    // strictly contains it. Scoped to entity-vs-entity containment only
    // (never crosses semantic types, never inspects entity identity or
    // domain vocabulary), and fires only on proven strict containment -
    // never a blanket "longest span wins" rule - so a genuinely
    // separate, non-overlapping entity mention elsewhere in the same
    // query is left untouched.
    semanticCandidates = semanticCandidates.filter((inner) => {
      if (inner.semanticType !== "entity") {
        return true;
      }

      return !semanticCandidates.some(
        (outer) =>
          outer !== inner &&
          outer.semanticType === "entity" &&
          outer.start <= inner.start &&
          outer.end >= inner.end &&
          (outer.start < inner.start || outer.end > inner.end),
      );
    });

    // RCG-002: mark metric candidates whose phrase was introduced by a
    // domain's declared generic-ranking-idiom rewrite rule (rather than
    // appearing verbatim in the user's own text) as fallback/default,
    // not explicit. Generic - only ever compares candidate phrases
    // against LexicalRewriter's own record of which rules it applied for
    // THIS query; never inspects domain/metric identity.
    for (const candidate of semanticCandidates) {
      if (candidate.semanticType !== "metric") {
        continue;
      }

      candidate.isFallback = rewritten.appliedReplacements.some(
        (applied) => applied.replacement.includes(candidate.phrase),
      );
    }

    // Phase 6.2: associate a ranking direction with metric candidates,
    // using the ORIGINAL (pre-rewrite) tokens - LexicalRewriter strips
    // modifier words before phrase extraction runs, so the modifier
    // signal must be recovered from `analyzed`, not `rewrittenTokens`.
    const modifierTokenIndices = analyzed
      .map((analyzedToken, index) => ({ role: analyzedToken.role, index }))
      .filter((entry) => entry.role === "modifier")
      .map((entry) => entry.index);

    const originalTokenValues = analyzed.map(
      (analyzedToken) => analyzedToken.token.value,
    );

    for (const candidate of semanticCandidates) {
      if (candidate.semanticType !== "metric") {
        continue;
      }

      const direction = this.directionResolver.resolve(
        originalTokenValues,
        modifierTokenIndices,
        candidate.phrase,
      );

      if (direction) {
        candidate.direction = direction;
      }
    }

    // RCG-020: the loop above can never associate a direction with a
    // fallback candidate - its phrase (the rewrite's replacement text)
    // never appears in the original, pre-rewrite tokens by definition,
    // so findSpan() above always fails for it. Recover direction
    // instead from whether the fired rewrite rule's own trigger phrase
    // (its `pattern`, which - unlike the replacement - IS present in
    // the original text) itself embeds a recognized modifier word, e.g.
    // "worst hospitals"'s pattern contains "worst". Only ever fills a
    // gap the loop above left empty; never overrides an already-found
    // direction, and never applies to a non-fallback candidate.
    for (const candidate of semanticCandidates) {
      if (
        candidate.semanticType !== "metric" ||
        !candidate.isFallback ||
        candidate.direction
      ) {
        continue;
      }

      const matchedRule = rewritten.appliedReplacements.find((applied) =>
        applied.replacement.includes(candidate.phrase),
      );

      if (!matchedRule) {
        continue;
      }

      const direction = this.directionResolver.resolveFromText(
        matchedRule.pattern,
      );

      if (direction) {
        candidate.direction = direction;
      }
    }

    // RCG-010: a genuine same-metric direction contradiction (e.g.
    // "best and worst overall rating") can only be judged once every
    // metric candidate is known - scoped to exactly one distinct
    // metric, since a query naming two DIFFERENT metrics may
    // legitimately carry an ascending modifier for one and a
    // descending modifier for the other (e.g. "highest rating and
    // lowest mortality") without any contradiction at all. Detection
    // itself never inspects a canonical id or domain vocabulary - only
    // the generic `metric` semantic type and the existing modifier
    // token indices/lexicon.
    const metricCandidates = semanticCandidates.filter(
      (candidate) => candidate.semanticType === "metric",
    );

    const distinctMetricKeys = new Set(
      metricCandidates.map((candidate) => candidate.canonicalKey),
    );

    let ambiguityError: string | undefined;

    if (distinctMetricKeys.size === 1) {
      const contradiction = this.directionResolver.detectContradiction(
        originalTokenValues,
        modifierTokenIndices,
      );

      if (contradiction) {
        ambiguityError = `I'm seeing both "${contradiction.ascendingWord}" and "${contradiction.descendingWord}" applied to the same ranking, so I'm not sure which direction you'd like - highest to lowest, or lowest to highest?`;
      }
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

    // F5 safety gate: detect (never interpret) a negation/exclusion
    // marker anywhere in the original text. Computed from `analyzed`
    // (pre-rewrite tokens), the same source already used for direction
    // detection above, so LexicalRewriter's own rewriting cannot hide a
    // negator from this check. Detection only - no candidate, filter,
    // or direction is touched here.
    const unsupportedNegation = analyzed.some(
      (analyzedToken) => analyzedToken.role === "negator",
    );

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
      ...(ambiguityError !== undefined ? { ambiguityError } : {}),
      ...(unsupportedNegation ? { unsupportedNegation } : {}),
    };
  }
}
