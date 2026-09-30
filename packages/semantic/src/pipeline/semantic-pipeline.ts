/** Turns a raw question into resolved semantic candidates: normalize, rewrite, extract phrases, resolve entities/aliases, suppress overlapping sub-spans, detect direction/negation conflicts. */
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
import { TemporalResolver } from "../temporal";
import type { EntityResolutionResult, EntityDefinition } from "@intelligence/domain-sdk";
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
    private readonly temporalResolver: TemporalResolver,
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

    // Phase 8.6A: a literal point-year value ("2021") is recognized independent of AliasResolver/Ontology - a year
    // has no Domain-registered definition. Kept separate from `semanticCandidates` - a "by year" grouping request
    // still resolves only through the ordinary alias path.
    const temporalCandidates = this.temporalResolver.resolve(rewrittenTokens);

    let semanticCandidates: SemanticCandidate[] = [];

    // Phase 8.1: genuinely ambiguous entity mentions - never guessed, never silently dropped. Spans are tracked so
    // the overlap suppression below (mirroring F4) can tell an over-extended sub-phrase from a standalone mention.
    const identityAmbiguities: {
      start: number;
      end: number;
      result: EntityResolutionResult;
    }[] = [];

    // Qualifier-safety: a longer phrase attempt reported `not_found` (a qualifier contradicting the sole
    // candidate a bare name resolves to) is tracked like an ambiguity, so a shorter, contained candidate of the
    // SAME entity type and exact `phrase` is recognized as the same mention, not an independent one. An exact
    // `phrase` match (not just span containment) distinguishes this from an already-qualified candidate that a
    // further over-extended attempt failed to narrow further.
    // Tier0 Task 3: also populated for a longer "ambiguous" attempt (not just "not_found") sharing the same
    // `phrase` - a brand-aliasing re-narrow is exactly as disqualifying for the shorter bare candidate.
    const identityConflicts: {
      start: number;
      end: number;
      entityId: string;
      phrase: string;
    }[] = [];

    // Batch 4: the subset of `identityConflicts` that was a plain `not_found` (never an ambiguity).
    const notFoundAttempts: typeof identityConflicts = [];

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
        if (entity.status === "ambiguous") {
          identityAmbiguities.push({
            start: phrase.start,
            end: phrase.end,
            result: entity,
          });

          if (entity.entityId && entity.phrase) {
            identityConflicts.push({
              start: phrase.start,
              end: phrase.end,
              entityId: entity.entityId,
              phrase: entity.phrase,
            });
          }
        } else if (entity.status === "not_found" && entity.entityId && entity.phrase) {
          identityConflicts.push({
            start: phrase.start,
            end: phrase.end,
            entityId: entity.entityId,
            phrase: entity.phrase,
          });
          notFoundAttempts.push({
            start: phrase.start,
            end: phrase.end,
            entityId: entity.entityId,
            phrase: entity.phrase,
          });
        }

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

    // F4: suppress spurious entity sub-spans. PhraseExtractor generates every contiguous sub-span, so a full
    // mention and a shorter sub-span sharing text can each resolve to a different entity - a contained span is an
    // extraction artifact, dropped in favor of the larger match. Bug B extension: ANY overlapping spans of the same
    // execution-parameter type prefer the LONGER span, not just strict containment. Geometry-driven only.
    semanticCandidates = semanticCandidates.filter((candidateA) => {
      if (candidateA.semanticType !== "entity") {
        return true;
      }

      return !semanticCandidates.some((candidateB) => {
        if (candidateB === candidateA || candidateB.semanticType !== "entity") {
          return false;
        }

        // `end` is INCLUSIVE (PhraseExtractor); the exclusive-end form missed a token shared at an edge (Batch 2).
        const spansOverlap = candidateA.start <= candidateB.end && candidateB.start <= candidateA.end;
        
        if (!spansOverlap) {
          return false;
        }

        // Bug B: Overlapping same execution-parameter type - prefer longer span
        const candidateADef = candidateA.definition as EntityDefinition;
        const candidateBDef = candidateB.definition as EntityDefinition;
        
        if (candidateADef.execution?.parameter === candidateBDef.execution?.parameter) {
          const lengthA = candidateA.end - candidateA.start;
          const lengthB = candidateB.end - candidateB.start;
          
          // Suppress A if B is longer (or equal length but B comes first)
          return lengthB > lengthA || (lengthB === lengthA && candidateB.start < candidateA.start);
        }

        // Original strict containment check for different parameter types
        return (
          candidateB.start <= candidateA.start &&
          candidateB.end >= candidateA.end &&
          (candidateB.start < candidateA.start || candidateB.end > candidateA.end)
        );
      });
    });

    // Qualifier-safety: a resolved entity candidate strictly contained within a tracked identity conflict's span
    // (same entity type AND exact `phrase`) is the same mention a longer qualified attempt already rejected, not
    // an independent one - keeping it would silently answer about the wrong entity.
    // Also requires the suppression to be safe against OTHER same-type entities elsewhere (a comparison): safe
    // only when this is the sole same-type entity, or another one already resolved to the same value - otherwise
    // ("Compare Mayo Clinic and Cleveland Clinic in Florida...") a trailing qualifier's target is ambiguous by
    // position alone, so neither entity is dropped.
    semanticCandidates = semanticCandidates.filter((candidate) => {
      if (candidate.semanticType !== "entity") {
        return true;
      }

      const conflicts = identityConflicts.filter(
        (conflict) =>
          conflict.entityId === candidate.canonicalKey &&
          conflict.phrase === candidate.phrase &&
          conflict.start <= candidate.start &&
          conflict.end >= candidate.end,
      );

      if (conflicts.length === 0) {
        return true;
      }

      const otherSameTypeCandidates = semanticCandidates.filter(
        (other) => other !== candidate && other.canonicalKey === candidate.canonicalKey,
      );

      const safeToSuppress =
        otherSameTypeCandidates.length === 0 ||
        otherSameTypeCandidates.some(
          (other) => other.resolvedValue === candidate.resolvedValue,
        );

      return !safeToSuppress;
    });

    const resolvedEntitySpans = semanticCandidates.filter(
      (candidate) => candidate.semanticType === "entity",
    );

    // Phase 8.4: a non-entity candidate (dimension, category) fully contained within a resolved entity's span is
    // part of that entity's own name, not independent - e.g. "county" inside "Greene County Hospital" doesn't
    // survive as its own "county-dimension" candidate once the hospital itself resolves. Generic: keys only on
    // span, never entity/domain identity.
    semanticCandidates = semanticCandidates.filter((candidate) => {
      if (candidate.semanticType === "entity") {
        return true;
      }

      return !resolvedEntitySpans.some(
        (entityCandidate) =>
          entityCandidate.start <= candidate.start && entityCandidate.end >= candidate.end,
      );
    });

    // Phase 8.1: the same exhaustive-substring artifact F4 handles also applies to an ambiguous entity-identity
    // result - an ambiguous span overlapping a real, surviving entity candidate is the same mention already
    // resolved, so it's dropped. Qualifier-identity-safety: the overlapping candidate must be the SAME entity type
    // as the ambiguity, else a different-type qualifier word (e.g. "Texas") is never grounds to discard it.
    // Batch 4: a `not_found` attempt no surviving same-type candidate overlaps is a mention of something that
    // doesn't exist; an ambiguity inside that span is the same mention seen without its qualifier.
    const identityNotFoundSpans = notFoundAttempts.filter(
      (attempt) =>
        !resolvedEntitySpans.some(
          (candidate) =>
            candidate.canonicalKey === attempt.entityId &&
            attempt.start <= candidate.end &&
            candidate.start <= attempt.end,
        ),
    );

    const candidateSuppressedIdentityAmbiguities = identityAmbiguities.filter(
      (ambiguity) =>
        !resolvedEntitySpans.some(
          (candidate) =>
            candidate.canonicalKey === ambiguity.result.entityId &&
            ambiguity.start <= candidate.end &&
            candidate.start <= ambiguity.end,
        ) &&
        !identityNotFoundSpans.some(
          (attempt) =>
            attempt.entityId === ambiguity.result.entityId &&
            attempt.start <= ambiguity.start &&
            attempt.end >= ambiguity.end,
        ),
    );

    // Qualifier-identity-safety: the same F4 artifact applies between two ambiguity entries of the SAME entity
    // type - a bare name and a qualified attempt on it can each remain "ambiguous"; the shorter one is dropped in
    // favor of the longer, strictly-containing one (F4's "longer span wins" geometry).
    const filteredIdentityAmbiguities = candidateSuppressedIdentityAmbiguities.filter(
      (inner) =>
        !candidateSuppressedIdentityAmbiguities.some(
          (outer) =>
            outer !== inner &&
            outer.result.entityId === inner.result.entityId &&
            outer.start <= inner.start &&
            outer.end >= inner.end &&
            (outer.start < inner.start || outer.end > inner.end),
        ),
    );

    // RCG-002: marks a metric candidate as fallback/default when its phrase came from a rewrite rule, not verbatim user text.
    for (const candidate of semanticCandidates) {
      const triggers = rewritten.appliedReplacements
        .filter((applied) => applied.replacement.includes(candidate.phrase))
        .map((applied) => applied.pattern);

      if (triggers.length > 0) {
        candidate.consumedText = triggers.join(" ");
      }

      if (candidate.semanticType !== "metric") {
        continue;
      }

      // Batch E: a phrase the user typed is explicit even when a rule rewrote words around it - marked fallback, it was dropped next to a second metric.
      candidate.isFallback =
        rewritten.appliedReplacements.some((applied) => applied.replacement.includes(candidate.phrase)) &&
        !` ${rewritten.original.toLowerCase()} `.includes(` ${candidate.phrase.toLowerCase()}`);
    }

    // Phase 6.2: associates a ranking direction using ORIGINAL (pre-rewrite) tokens - LexicalRewriter strips modifier words before phrase extraction.
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

      const resolvedDirection = this.directionResolver.resolveDetailed(
        originalTokenValues,
        modifierTokenIndices,
        candidate.phrase,
      );

      if (resolvedDirection) {
        candidate.direction = resolvedDirection.direction;
        candidate.directionBasis = resolvedDirection.basis;
      }
    }

    // RCG-020: the loop above can never find a direction for a fallback candidate (its phrase never appears in the
    // original tokens) - recovers it from the rewrite rule's own trigger pattern instead, which IS in the original text.
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

      const resolvedDirection = this.directionResolver.resolveFromTextDetailed(
        matchedRule.pattern,
      );

      if (resolvedDirection) {
        candidate.direction = resolvedDirection.direction;
        candidate.directionBasis = resolvedDirection.basis;
      }
    }

    // RCG-010: a same-metric direction contradiction ("best and worst overall rating") is scoped to exactly one
    // distinct metric - two DIFFERENT metrics may legitimately carry opposite modifiers without contradiction.
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

    // F5 safety gate: detects (never interprets) a negation/exclusion marker in the original text, computed from
    // `analyzed` (pre-rewrite) so LexicalRewriter can't hide a negator. Detection only.
    // V4 Batch 2: a negator inside a phrase already resolved to a registered ENTITY is part of that entity's name,
    // not a negation ("not for profit" is a registered ownership phrase). Matched by word, not index, since
    // candidate start/end count rewritten-stream tokens, a different length from `analyzed`'s pre-rewrite ones.
    const insideResolvedEntityPhrase = (index: number): boolean =>
      semanticCandidates.some((candidate) => {
        if (candidate.semanticType !== "entity") {
          return false;
        }

        const phraseWords = candidate.phrase.split(" ");

        for (let start = Math.max(0, index - phraseWords.length + 1); start <= index; start++) {
          if (phraseWords.every((word, offset) => analyzed[start + offset]?.token.value === word)) {
            return true;
          }
        }

        return false;
      });
    const unsupportedNegation = analyzed.some(
      (analyzedToken, index) => analyzedToken.role === "negator" && !insideResolvedEntityPhrase(index),
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
      ...(filteredIdentityAmbiguities.length > 0
        ? { identityAmbiguities: filteredIdentityAmbiguities.map((a) => a.result) }
        : {}),
      ...(identityNotFoundSpans.length > 0
        ? { identityNotFound: identityNotFoundSpans.map(({ entityId, phrase }) => ({ entityId, phrase })) }
        : {}),
      ...(temporalCandidates.length > 0 ? { temporalCandidates } : {}),
    };
  }
}
