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
import type { EntityResolutionResult } from "@intelligence/domain-sdk";
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

    // Phase 8.6A: a literal point-year value (e.g. "2021") is recognized
    // from the same token stream PhraseExtractor uses, independent of
    // AliasResolver/Ontology - a literal year has no Domain-registered
    // definition and must never be looked up in any registry. Kept
    // entirely separate from `semanticCandidates`/`matches`: a "year"/
    // "by year" grouping request continues to resolve only through the
    // ordinary alias path below (`year-dimension`, semanticType
    // "dimension") and is never affected by this.
    const temporalCandidates = this.temporalResolver.resolve(rewrittenTokens);

    let semanticCandidates: SemanticCandidate[] = [];

    // Phase 8.1: entity mentions the Domain SDK's EntityProvider reports as
    // genuinely ambiguous (more than one legitimate candidate identity) -
    // never guessed, never dropped without a trace. See
    // SemanticResolutionResult.identityAmbiguities. Spans are tracked
    // alongside so the containment/overlap suppression below (mirroring
    // F4's own logic) can tell an over-extended, garbage-qualifier
    // sub-phrase apart from a genuinely standalone ambiguous mention.
    const identityAmbiguities: {
      start: number;
      end: number;
      result: EntityResolutionResult;
    }[] = [];

    // Qualifier-safety: a longer phrase attempt that named a known
    // entity type (via its `entityId`) but was explicitly reported
    // `not_found` - e.g. a qualifier that contradicts the sole
    // candidate a bare name resolves to - is tracked the same way an
    // ambiguity is, so the suppression pass below can recognize that a
    // shorter, contained resolved candidate of the SAME entity type,
    // representing the exact same bare name (`phrase`), is not a
    // separate, independently-valid mention: it's the same mention a
    // longer, more specific attempt on the same text already examined
    // and rejected. Requiring an exact `phrase` match (not merely span
    // containment) is what distinguishes this from a genuinely
    // successful, already-qualified candidate that a further, over-
    // extended attempt failed to narrow any further (e.g. "Mayo Clinic
    // in Jacksonville, Florida": "mayo clinic in jacksonville" resolves
    // uniquely; the over-extended "mayo clinic in jacksonville
    // florida" fails, but its own bare-name portion is still "mayo
    // clinic", not "mayo clinic in jacksonville" - so it never matches
    // the surviving candidate's own phrase and never suppresses it).
    // Never populated for a phrase the Domain SDK never recognized at
    // all (`entityId: null`), only for a named entity type whose
    // qualifier genuinely conflicted.
    const identityConflicts: {
      start: number;
      end: number;
      entityId: string;
      phrase: string;
    }[] = [];

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
        } else if (entity.status === "not_found" && entity.entityId && entity.phrase) {
          identityConflicts.push({
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

    // Qualifier-safety: a resolved entity candidate whose span is
    // strictly contained within a tracked identity conflict's span
    // (same entity type - see `identityConflicts` above) is not an
    // independently-valid mention. It is the same underlying mention a
    // longer, explicitly-qualified attempt on the same text already
    // examined and rejected (the qualifier contradicted the only
    // candidate that name resolves to) - continuing to treat the
    // shorter, unqualified sub-phrase as if the query had never named
    // a qualifier at all would silently answer about the wrong entity.
    // Scoped narrowly: only suppresses a candidate whose own
    // `canonicalKey` matches the conflict's `entityId` (never a
    // different entity type, e.g. a qualifier word that independently
    // resolves as its own, unrelated entity - see the Phase 8.1
    // suppression condition below for that distinct case), whose own
    // `phrase` exactly equals the conflict's bare-name `phrase` (so an
    // already-qualified, genuinely-resolved candidate - e.g. "mayo
    // clinic in jacksonville" - is never suppressed merely because a
    // further, over-extended attempt on the same bare name failed to
    // narrow any further), and only on proven strict containment,
    // mirroring F4's own geometry.
    //
    // Additionally requires the suppression to be safe with respect to
    // OTHER same-type entity candidates elsewhere in the query (a
    // multi-entity request, e.g. an explicit comparison): suppressing
    // is safe when this is the only same-type entity anywhere in the
    // query (nothing else could plausibly be the qualifier's real
    // target), or when another same-type candidate elsewhere already
    // resolved to the exact same value (this candidate is a redundant,
    // corrupted second mention of an entity already captured
    // correctly, not independent information). Otherwise, a trailing
    // qualifier positioned near one of several distinct entities in a
    // comparison is not assumed to belong to that specific entity -
    // e.g. "Compare Mayo Clinic and Cleveland Clinic in Florida..."
    // must not drop Cleveland Clinic merely because it is not in
    // Florida; the two entities remain independent, unrelated
    // mentions, and the trailing qualifier's intended target is
    // genuinely unclear from span position alone.
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

    // Phase 8.4: a non-entity candidate (dimension, category, etc.) whose
    // span is fully contained within a successfully-resolved entity
    // candidate's span is part of that entity's own name/mention, not an
    // independent signal the user expressed - e.g. the word "county"
    // inside "Greene County Hospital" must not survive as a standalone
    // "county-dimension" candidate once "Greene County Hospital" itself
    // resolves as a real entity, exactly as F4 above already prevents a
    // shorter entity sub-span from surviving alongside a larger one.
    // Generic and additive: keys only on `semanticType`/`start`/`end` -
    // never inspects which entity, which dimension/category, or which
    // domain is involved, and never touches F4's own entity-vs-entity
    // filtering or the Phase 8.1 identity-ambiguity containment logic
    // below (both operate on separate arrays/conditions). A genuinely
    // separate, non-overlapping dimension/category mention elsewhere in
    // the same query is left untouched.
    semanticCandidates = semanticCandidates.filter((candidate) => {
      if (candidate.semanticType === "entity") {
        return true;
      }

      return !resolvedEntitySpans.some(
        (entityCandidate) =>
          entityCandidate.start <= candidate.start && entityCandidate.end >= candidate.end,
      );
    });

    // Phase 8.1: the same exhaustive-substring artifact F4 handles above
    // also applies to an ambiguous entity-identity result - e.g. an
    // over-extended qualifier phrase ("<name> in <state> overall rating")
    // where the trailing words don't narrow anything, reported ambiguous
    // by the Domain SDK, even though a shorter, correctly-qualified
    // sub-phrase of the same mention ("<name> in <state>") already
    // resolved to exactly one real entity candidate. An ambiguous result
    // whose span overlaps a real, surviving entity candidate is not a
    // separate, unresolved mention - it's the same mention the entity
    // candidate already resolved - so it is dropped. A genuinely
    // unqualified ambiguous mention (no overlapping entity candidate
    // anywhere in the query) is left untouched.
    //
    // Qualifier-identity-safety correction: the overlapping candidate
    // must be of the SAME entity type as the ambiguity (its
    // `canonicalKey` must equal the ambiguity's own `entityId`) before
    // it may suppress it. A qualifier word that independently resolves
    // as its own, different-type entity (e.g. "Texas" as a `state`
    // entity, overlapping a `hospital` ambiguity that this same
    // qualifier word already, correctly, narrowed) is never grounds to
    // discard a genuine, still-real ambiguity - discarding it would
    // silently replace a correctly-narrowed candidate set with a
    // broader, un-narrowed one instead of preserving the user's own
    // qualifier.
    const candidateSuppressedIdentityAmbiguities = identityAmbiguities.filter(
      (ambiguity) =>
        !resolvedEntitySpans.some(
          (candidate) =>
            candidate.canonicalKey === ambiguity.result.entityId &&
            ambiguity.start <= candidate.end &&
            candidate.start <= ambiguity.end,
        ),
    );

    // Qualifier-identity-safety: the same exhaustive-substring artifact
    // F4 handles for resolved entity candidates also applies between
    // two ambiguity entries on the SAME entity type - e.g. a bare name
    // ("memorial hospital") and a qualified attempt on that same name
    // ("memorial hospital in texas") can each independently remain
    // "ambiguous" (the qualifier narrowed the set but not to exactly
    // one). The shorter, unqualified ambiguity is not a separate user
    // mention - it's the same mention a longer, more specific attempt
    // on the same text already examined - so it is dropped in favor of
    // the longer, strictly-containing ambiguity, mirroring F4's own
    // "longer/more-specific span wins" geometry exactly. A genuinely
    // separate, non-overlapping ambiguous mention elsewhere in the same
    // query, or one with no longer containing counterpart, is left
    // untouched.
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
      ...(filteredIdentityAmbiguities.length > 0
        ? { identityAmbiguities: filteredIdentityAmbiguities.map((a) => a.result) }
        : {}),
      ...(temporalCandidates.length > 0 ? { temporalCandidates } : {}),
    };
  }
}
