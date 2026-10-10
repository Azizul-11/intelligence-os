/** Builds the RuntimeEngine: runs a question through semantic resolution, the Phase 8 answerability gates, SQL execution, and the optional LLM layers, end to end. */
import type { DomainRuntime } from "@intelligence/domain-runtime";
import type { QueryPlanner, ExecutionPlanMapper } from "@intelligence/query-planner";
import { assessPlanCompleteness, hasRelationshipWithoutBenchmark, detectSubsumedBenchmarkRisk, requestedCount } from "@intelligence/query-planner";
import type { SqlExecutor } from "@intelligence/sql-executor";
import type { SemanticResolver, SemanticCandidate } from "@intelligence/semantic";
import type { ExecutionPlan, ExecutionFilter } from "@intelligence/contracts";
import type { EntityDefinition, MetricDefinition, SqlTemplateParameter, SuggestionContext } from "@intelligence/domain-sdk";

import type { RuntimeEngine } from "./runtime-engine";
import type { RuntimeRequest } from "./runtime-request";
import type { RuntimeResult } from "./runtime-result";
import type { CoverageFact } from "./coverage-fact";
import { buildClarificationMessage } from "./build-clarification-message";
import { buildGuidanceMessage } from "./build-guidance-message";
import { PhaseGateTracker, type PhaseGateDetail } from "./phase-gate-tracker";

// Diagnostic detail for trace entries: flat strings, capped so one large result cannot inflate every response.
const TRACE_TEXT_MAX = 200;
function traceText(text: string): string {
  return text.length > TRACE_TEXT_MAX ? `${text.slice(0, TRACE_TEXT_MAX - 3)}...` : text;
}
function describeParameters(parameters: object): string {
  return traceText(Object.entries(parameters).map(([key, value]) => `${key}=${String(value)}`).join("; "));
}

/** Phase 8.8: compares by VALUE, not parameter NAME, so a Domain's own renaming (e.g. "hospital" -> "hospitalId") never breaks this check - keeps it Domain-agnostic. */
function valuesMatch(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  return a === b;
}

/**
 * Phase 8.8: a filter is compatible with a candidate template when some declared parameter resolves (by value, see
 * valuesMatch()) to that filter's value, and - for a multi-value "in" filter - that parameter is "array"-typed (the
 * only shape SqlExecutor's array rendering is safe for). Shared as-is with Phase 8.9's alternative discovery below.
 * Tier1 Task 5: only "in" filters can ever be incompatible - a scalar "=" filter with no matching parameter is left
 * alone (return true) unconditionally, so a redundant, coarser filter beside an already-resolved identity (e.g.
 * "state" beside a uniquely-identifying "hospital") is never flagged. This is what makes the check safe to apply to
 * every operation, not just "rank"/"aggregate".
 */
function isFilterCompatibleWithTemplate(
  filter: ExecutionFilter,
  resolvedParameters: Record<string, unknown>,
  templateParameters: SqlTemplateParameter[],
): boolean {
  if (filter.operator !== "in") {
    return true;
  }

  const matchingParameter = templateParameters.find((parameter) =>
    valuesMatch(resolvedParameters[parameter.name], filter.value),
  );

  return matchingParameter?.type === "array";
}

const ALTERNATIVE_OPERATION_FLAG = {
  rank: "rankable",
  aggregate: "aggregatable",
  compare: "comparable",
} as const;

/**
 * Phase 8.9: when the requested metric has no available execution capability, look for other real, currently-
 * supported Domain-declared metrics that could execute this same request shape in its place. Not a new similarity
 * model - a candidate qualifies only by the same three checks already applied to the requested metric itself
 * (capability flag, Phase 8.5 template-existence, Phase 8.8 filter-compatibility). "Same category" is deliberately
 * not one of them, since same-category metrics may query entirely different, independently-unavailable tables.
 * Returns candidates in declaration order, never scored or ranked.
 */
function discoverAlternatives(
  unavailableMetricId: string,
  executionPlan: ExecutionPlan,
  runtime: DomainRuntime,
): { capabilityId: string }[] {
  const requiredFlag = ALTERNATIVE_OPERATION_FLAG[executionPlan.operation as keyof typeof ALTERNATIVE_OPERATION_FLAG];

  const { executionStrategy } = runtime.domain;

  if (!requiredFlag || !executionStrategy.selectTemplateFromPlan || !executionStrategy.resolveParametersFromPlan) {
    return [];
  }

  const parameters = executionStrategy.resolveParametersFromPlan(executionPlan);
  const alternatives: { capabilityId: string }[] = [];

  for (const candidate of runtime.domain.metrics as readonly MetricDefinition[]) {
    if (candidate.id === unavailableMetricId || !candidate[requiredFlag]) {
      continue;
    }

    const candidateTemplateId = executionStrategy.selectTemplateFromPlan(
      { ...executionPlan, metric: candidate.id },
    );

    const candidateTemplate = runtime.sqlResolver.resolve(candidateTemplateId);
    if (!candidateTemplate.found || !candidateTemplate.template || candidateTemplate.template.enabled === false) {
      continue;
    }

    const candidateTemplateParameters = candidateTemplate.template.parameters ?? [];
    const isCompatible = executionPlan.filters.every((filter) =>
      isFilterCompatibleWithTemplate(filter, parameters, candidateTemplateParameters),
    );

    if (isCompatible) {
      alternatives.push({ capabilityId: candidate.id });
    }
  }

  return alternatives;
}

/**
 * Phase 3.6: staged-rollout feature flag for Layer 0.5 (see its call site below). A generic ops toggle, not a
 * Healthcare concern, so this doesn't cross the Universal-vs-Domain boundary. Read via `globalThis` rather than a
 * bare `process` reference so this package needs no new `@types/node` dependency. Defaults to disabled - the
 * pre-existing Layer 1 behavior stays the production default until set to the literal string "true".
 */
function isLlmFirstFrontDoorEnabled(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return env?.LLM_FIRST_FRONT_DOOR_ENABLED === "true";
}

type CreateRuntimeEngineOptions = {
  runtime: DomainRuntime;
  semantic: SemanticResolver;
  planner: QueryPlanner;
  executionPlanMapper: ExecutionPlanMapper;
  executor: SqlExecutor;
  /**
   * LLM Integration Layer 1 (Messy Input Normalizer): optional hook (orchestrator-supplied, wired to
   * `llmGateway.normalizeMessyLanguage()`) - Universal Core stays LLM-unaware when omitted. Fires only on
   * "semantic-incomplete"; a `canonicalQuestion` is never trusted directly, it's re-run through this engine's
   * full pipeline. `clarification` just replaces the gate's error text with a natural-language follow-up (no
   * re-run, avoids guessing a scope the user never gave). `meta` is opaque diagnostics, traced verbatim and
   * otherwise unread. `unsupportedTerms` (Batch 1) is a binding refusal (0 SQL), unlike a bare "no usable answer".
   */
  llmFallback?: (question: string) => Promise<
    | { canonicalQuestion: string; meta?: PhaseGateDetail }
    | { clarification: string; meta?: PhaseGateDetail }
    | { unsupportedTerms: readonly string[]; meta?: PhaseGateDetail }
    | { meta: PhaseGateDetail }
    | null
  >;
  /**
   * Bug L Beyond: optional hook, orchestrator-supplied - a domain-owned, deterministic, synchronous rewrite of the
   * raw question applied before anything else. Universal Core never inspects what it rewrites. Exists so a Domain
   * SDK can expand its own short forms (e.g. Healthcare's state abbreviations) using letter case, a signal already
   * destroyed by the time `semantic.resolve()` runs. Applied once, unconditionally, at the top of `execute()` -
   * idempotent no-op when nothing matches.
   */
  preprocessQuestion?: (question: string) => string;
  /**
   * Batch 5C: optional, orchestrator-supplied - the domain's own deterministic scope check (topics it can't
   * answer, matched on whole words; no model, no SQL). Layer 0.5 runs it inside `llmFallback`, but a question that
   * skips Layer 0.5 (already-resolved entity, chip) skips this too, so it also runs standalone here, on the
   * question's remaining words after resolved-entity words are removed. A hit is the same binding refusal (0 SQL)
   * a model decline is. Ignored unless the front door is on.
   */
  unsupportedPrecheck?: (question: string) => readonly string[];
  /**
   * ConversationalFix: optional, orchestrator-supplied - a cheap, domain-agnostic check for whether a question
   * reaching this point is small talk/a capability question rather than a real data request. Runs only right
   * before `llmFallback` (the paid chain), so anything resolved above never pays its latency. A defined result
   * short-circuits to a conversational, 0-SQL answer; undefined falls through to unchanged behavior.
   */
  conversationalCheck?: (question: string) => Promise<{ answer: string; suggestions: readonly string[] } | undefined>;
};

/** The words of `normalizedQuery` left after every resolved entity's own words are taken out (both are already normalized). */
function withoutEntityPhrases(normalizedQuery: string, matches: readonly { semanticType: string; phrase: string }[]): string {
  return matches
    .filter((match) => match.semanticType === "entity")
    .reduce((text, match) => text.split(` ${match.phrase} `).join(" "), ` ${normalizedQuery} `)
    .trim();
}

// V4 fix plan (Batch 1): `requestedCount` MOVED to `packages/query-planner/src/requested-count.ts` (imported above),
// so this reader and the unaccounted-word guard's limit-token exemption (`QueryPlanner.findUnaccountedWords`) can
// never disagree about which number a question asks for. Behaviour here is unchanged.

export function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor,
  llmFallback,
  preprocessQuestion,
  unsupportedPrecheck,
  conversationalCheck,
}: CreateRuntimeEngineOptions): RuntimeEngine {
  // Tier1 Task 6: `engine` is declared before `execute` runs so the
  // suggestion dry-run loop below can recursively call `engine.execute`
  // on itself (self-reference via closure, resolved by the time any
  // request actually arrives).
  const engine: RuntimeEngine = {
    async execute(incomingRequest: RuntimeRequest): Promise<RuntimeResult> {
      // Bug L Beyond: rewrite once, up front - every reference to
      // `request.question` below (the tracer, semantic resolution, the
      // Layer 1 fallback, suggestion dedup) then sees the same already-
      // expanded text, with zero further changes needed downstream.
      const request: RuntimeRequest = preprocessQuestion
        ? { ...incomingRequest, question: preprocessQuestion(incomingRequest.question) }
        : incomingRequest;
      // Tier0 Task 2 (F8) Phase 2: Query Tracer Observability. Wraps the
      // entire, unchanged pipeline below so every response - whichever
      // gate it stops at - carries a `trace` of exactly which gates this
      // specific request actually visited. The tracker only ever records
      // what already happened; it changes no control flow.
      const tracker = new PhaseGateTracker(
        request.requestId ?? crypto.randomUUID(),
        request.question,
      );

      /**
       * ConversationalFix (2026-09-27): shared by both `llmFallback` call sites below (Layer 0.5 and its Layer 1
       * on-failure mirror) - a question can reach either one, and both are equally "about to pay for the paid
       * chain," so both get the same cheap conversational triage first. Returns undefined (uncertain, or
       * genuinely analytical) to fall straight through to the existing, unchanged `llmFallback` call; a defined
       * result should be returned directly by the caller. See CreateRuntimeEngineOptions.conversationalCheck's own
       * doc comment and docs/Post Capability Expansion Work/ConversationalFIx/AUDIT_CONVERSATIONAL_INTENT_ROUTING.md.
       */
      const tryConversationalCheck = async (): Promise<RuntimeResult | undefined> => {
        if (!conversationalCheck) {
          return undefined;
        }
        tracker.enter("conversational-check");
        const conversational = await conversationalCheck(request.question);

        if (!conversational) {
          tracker.exit("conversational-check", "analytical", 0);
          return undefined;
        }

        const suggestions: string[] = [];
        for (const candidate of conversational.suggestions) {
          if (suggestions.length >= 4) {
            break;
          }
          // Same dry-run proof RuntimeResult.suggestions already guarantees everywhere else in this file - a
          // model-written example question is never trusted as answerable on its own.
          const trial = await engine.execute({ question: candidate, dryRun: true });
          if (trial.success) {
            suggestions.push(candidate);
          }
        }

        tracker.exit("conversational-check", "conversational", 0, "conversational", {
          answer: conversational.answer.slice(0, 300),
        });
        return {
          success: true,
          rows: [],
          rowCount: 0,
          answerability: { status: "conversational" },
          conversationalAnswer: conversational.answer,
          suggestions,
          trace: tracker.gates,
        };
      };

      // Batch 5A-1 (scoped guard): the words of the RAW question that nothing resolved, set only when the LLM front
      // door (Layer 0.5) was consulted because of such words and produced no rewrite. The pipeline below then runs on
      // the raw text and would answer the rest of the question, silently dropping them (a default ranking returned
      // for a question that also named something the domain does not know). See the guard in runPipeline.
      let frontDoorUnaccounted: string[] = [];

      // Tier1 Task 6: captured as a side effect at the single point
      // below where execution-plan-mapper builds it, so the suggestion
      // generator can use the same plan this request already built
      // without threading it through every one of runPipeline()'s many
      // return statements.
      let capturedExecutionPlan: ExecutionPlan | undefined;

      const runPipeline = async (): Promise<RuntimeResult> => {
      console.log(">>> RuntimeEngine.execute()");
      tracker.enter("semantic-candidate-resolution");
      const semanticResult = semantic.resolve(request.question);
      tracker.exit(
        "semantic-candidate-resolution",
        semanticResult.resolved ? "ok" : "unresolved",
        0,
        undefined,
        {
          phrases: traceText(semanticResult.matches.map((match) => match.phrase).join("; ")),
          canonicalKeys: traceText(semanticResult.matches.map((match) => match.canonicalKey).join("; ")),
          candidateCount: semanticResult.matches.length,
          semanticType: String(semanticResult.semanticType ?? "none"),
        },
      );

console.log("========== SEMANTIC RESULT ==========");
console.log(
  JSON.stringify(semanticResult, null, 2),
);
console.log("=====================================");

      // Tier0 Task 6: Layer 2 continuation structural identity injection. A Turn 2 request carrying a
      // `forcedIdentityCandidate` already pinned down which candidate the user meant in Turn 1 - re-deriving it
      // from the reconstructed text alone is not safe (can re-trigger the same ambiguity). Matches the forced
      // candidate's opaque `value` against every ambiguity's `candidates` list, by value only (mirroring
      // valuesMatch()), never trusting a value the offered candidates didn't contain. Only resolves an ambiguity
      // that still exists on this fresh resolution; an entity already resolved through the ordinary pipeline is
      // left untouched.
      if (request.forcedIdentityCandidate && semanticResult.identityAmbiguities) {
        const forcedValue = request.forcedIdentityCandidate.value;
        const matchIndex = semanticResult.identityAmbiguities.findIndex((ambiguity) =>
          (ambiguity.candidates ?? []).some(
            (candidate) =>
              valuesMatch(candidate, forcedValue) ||
              valuesMatch((candidate as { value?: unknown } | null)?.value, forcedValue),
          ),
        );

        if (matchIndex !== -1) {
          const resolvedAmbiguity = semanticResult.identityAmbiguities.splice(matchIndex, 1)[0]!;
          const entityDefinition = resolvedAmbiguity.entityId
            ? runtime.registry.getEntity(resolvedAmbiguity.entityId)
            : undefined;

          if (entityDefinition) {
            semanticResult.matches.push({
              phrase: resolvedAmbiguity.phrase ?? "",
              canonicalKey: resolvedAmbiguity.entityId!,
              semanticType: "entity",
              definition: entityDefinition,
              confidence: 1,
              start: 0,
              end: 0,
              resolvedValue: forcedValue,
            });
          }
        }
      }

      // Comparison continuation fix: inject companion entities from Turn 1.
      // When a comparison query had one ambiguous entity and one or more
      // non-ambiguous entities (e.g., "compare memorial hospital vs ANIMAS"),
      // Turn 2 must preserve ALL entities, not just the disambiguated one.
      // Companion entities are the non-ambiguous entities from Turn 1 that
      // were already resolved successfully and carried through to Turn 2.
      if (request.companionEntities && request.companionEntities.length > 0) {
        for (const companion of request.companionEntities) {
          const entityDefinition = runtime.registry.getEntity(companion.canonicalKey);

          // Batch 4: a companion that is one of an ambiguity's own candidates
          // settles that ambiguity too (a two-slot reply to a comparison,
          // "ABILENE and GONZALES", names both facilities at once). By value
          // only, like the forced candidate above.
          const settledIndex = (semanticResult.identityAmbiguities ?? []).findIndex((ambiguity) =>
            (ambiguity.candidates ?? []).some(
              (candidate) =>
                valuesMatch(candidate, companion.value) ||
                valuesMatch((candidate as { value?: unknown } | null)?.value, companion.value),
            ),
          );

          if (settledIndex !== -1) {
            semanticResult.identityAmbiguities!.splice(settledIndex, 1);
          }

          if (entityDefinition) {
            semanticResult.matches.push({
              phrase: "", // Companion entity phrase not needed for execution
              canonicalKey: companion.canonicalKey,
              semanticType: "entity",
              definition: entityDefinition,
              confidence: 1,
              start: 0,
              end: 0,
              resolvedValue: companion.value,
            });
          }
        }
      }

      // Batch 4: an injected identity is a real semantic candidate. A Turn 2
      // whose only candidates were the ambiguities it just settled ("Compare
      // Memorial Hospital vs Memorial Hospital") is no longer "unresolved".
      if (!semanticResult.resolved && semanticResult.matches.length > 0) {
        semanticResult.resolved = true;
      }

      // Phase 8.1: an entity mention resolving to more than one legitimate candidate identity (e.g. two hospitals
      // sharing a name) is refused honestly before any planning/SQL, never silently resolved to one candidate.
      // Phase 8.3: the refusal names the ambiguous mention and its actual candidate labels when the Domain SDK
      // supplies them, instead of a fixed generic sentence.
      // Post-8.3 gate-ordering fix: checked BEFORE `!semanticResult.resolved`, since `identityAmbiguities` can be
      // populated even when nothing else resolved (`resolved` is a separate signal) - a concrete ambiguity is
      // always more actionable than the generic "Unable to resolve question." fallback and must not be discarded
      // just because something else also failed.
      tracker.enter("entity-identity-ambiguity");

      // Batch 4: a named entity whose qualifying place holds none of its candidates ("Memorial Hospital in
      // Alabama") is refused, never answered without the name. 0 SQL.
      // Not for a Layer 2 continuation: its identities are pinned by value (`forcedIdentityCandidate`,
      // `companionEntities`), and the reconstructed text ends with the place the user just chose, which in a
      // comparison lands on the LAST named hospital and contradicts the first - refusing here dropped the second
      // hospital of every comparison Turn 2.
      const identitiesPinnedByContinuation =
        request.identityAlreadyResolved === true ||
        request.forcedIdentityCandidate !== undefined ||
        (request.companionEntities?.length ?? 0) > 0;

      if (
        !identitiesPinnedByContinuation &&
        semanticResult.identityNotFound &&
        semanticResult.identityNotFound.length > 0
      ) {
        const missing = semanticResult.identityNotFound[0]!;
        tracker.exit("entity-identity-ambiguity", "not-found", 0, "not_directly_answerable", {
          missingPhrase: traceText(missing.phrase),
          missingEntityId: missing.entityId,
        });

        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: `I couldn't find a ${missing.entityId} matching "${missing.phrase}" in the place you named, so I can't answer about it. Check the name and the place, or ask about ${missing.entityId}s there in general.`,
          answerability: { status: "not_directly_answerable", reason: "data-unavailable" },
        };
      }

      if (semanticResult.identityAmbiguities && semanticResult.identityAmbiguities.length > 0) {
        tracker.exit("entity-identity-ambiguity", "ambiguous", 0, "ambiguous", {
          ambiguousPhrases: traceText(semanticResult.identityAmbiguities.map((ambiguity) => ambiguity.phrase ?? "").join("; ")),
          candidateCount: semanticResult.identityAmbiguities.reduce(
            (sum, ambiguity) => sum + (ambiguity.candidates?.length ?? 0),
            0,
          ),
        });
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: buildClarificationMessage(semanticResult.identityAmbiguities),
          answerability: {
            status: "ambiguous",
            reason: "identity-ambiguous",
            candidates: semanticResult.identityAmbiguities.flatMap(
              (ambiguity) => ambiguity.candidates ?? [],
            ),
          },
          // Tier0 Task 6: carries this Turn's already-resolved metric/
          // concept/etc candidates (never the ambiguous entity itself)
          // forward, so a Layer 2 continuation's pending interaction can
          // store real reconstruction context in `originalSemanticResult`
          // instead of an empty placeholder.
          semanticMatches: semanticResult.matches,
        };
      }

      tracker.exit("entity-identity-ambiguity", "ok", 0, undefined, {
        ambiguityCount: 0,
        pinnedByContinuation: identitiesPinnedByContinuation,
      });

      if (!semanticResult.resolved) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "Unable to resolve question.",
          // LLM Integration Layer 1: "semantic-incomplete" is the same
          // already-declared reason line ~397 below attaches for the
          // conceptually identical "nothing meaningful extracted from
          // the request at all" case (see AnswerabilityReason's own doc
          // comment) - reused, not invented, so the outer execute()
          // wrapper can precisely target only this dead-end shape for
          // an LLM rewrite attempt, never any other refusal reason.
          answerability: { status: "not_directly_answerable", reason: "semantic-incomplete" },
        };
      }

      // Batch 1: unaccounted-word gate for an LLM-rewritten question. A word the user typed that the rewrite kept
      // and no semantic candidate accounted for is a constraint the pipeline would silently drop and answer
      // without - refused honestly before any SQL (same `semantic-incomplete` reason as the dead end above).
      // Scoped to the rewritten run only: the same rule on a first pass would refuse correct answers carrying a
      // harmless extra word - those are judged by the LLM's own `unsupported_terms` instead. A word the rewrite
      // introduced itself is ignored (see QueryPlanner.findUnaccountedWords). Domain-agnostic: no vocabulary.
      if (request.rewrittenFrom) {
        const dropped = planner.findUnaccountedWords(
          semanticResult.normalizedQuery,
          semanticResult.matches,
          runtime.domain.entities,
          request.rewrittenFrom,
        );

        if (dropped.length > 0) {
          tracker.enter("unaccounted-word-guard");
          tracker.exit("unaccounted-word-guard", "refused", 0, "not_directly_answerable", {
            unaccountedWords: dropped.join(" "),
          });

          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: "Unable to resolve question.",
            answerability: { status: "not_directly_answerable", reason: "semantic-incomplete" },
          };
        }
      } else if (frontDoorUnaccounted.length > 0) {
        // Batch 5A-1: the scoped form of the same guard, and it ANNOTATES instead of refusing. The front door
        // couldn't read these words, so the trace records them and the caller discloses, in the answer, which
        // words it ignored - never silently. Not a refusal: measured against the 600-query baseline, refusing here
        // would have turned 4 correct answers into refusals to fix 3 wrong ones. Still 0 extra SQL, no gate effect.
        tracker.enter("unaccounted-word-guard");
        tracker.exit("unaccounted-word-guard", "annotated", 0, undefined, {
          unaccountedWords: frontDoorUnaccounted.join(" "),
          scope: "front-door-declined",
        });
      }

      // V4 fix plan (Batch 4): a stacked qualifier (a hospital type, an ownership sub-label, a flag, a star-rating
      // filter) the rewrite silently dropped or swapped is restored from the user's OWN words, never invented and
      // never overriding a value the rewrite already chose - only added when the rewritten question's own
      // resolution is missing a parameter the raw question resolved. Domain-agnostic: Universal Core inspects no
      // parameter's meaning, only whether `domain.preservedEntityParameters` lists it and whether it is present.
      // Scoped to the rewritten run only (`request.rewrittenFrom`), bounded to one attempt
      // (`qualifierRestoreAttempted`), and skipped whenever the raw question names a unique hospital record - a named
      // hospital's own resolution must never be mistaken for, or disturbed by, a type/ownership/flag qualifier.
      if (request.rewrittenFrom && !request.qualifierRestoreAttempted && (runtime.domain.preservedEntityParameters?.length ?? 0) > 0) {
        const rawResolution = semantic.resolve(request.rewrittenFrom);
        const rawHasUniqueRecordMatch = rawResolution.matches.some(
          (candidate) =>
            candidate.semanticType === "entity" &&
            (candidate.definition as EntityDefinition).identifiesUniqueRecord === true,
        );

        if (!rawHasUniqueRecordMatch) {
          const boundEntityParameters = (matches: readonly SemanticCandidate[]) =>
            new Map(
              matches
                .filter((candidate) => candidate.semanticType === "entity" && candidate.resolvedValue !== undefined && candidate.resolvedValue !== null)
                .map((candidate) => [(candidate.definition as EntityDefinition).execution?.parameter, candidate] as const),
            );
          const keptParameters = boundEntityParameters(semanticResult.matches);
          const lostQualifiers = [...boundEntityParameters(rawResolution.matches)].filter(
            ([parameter]) => parameter !== undefined && runtime.domain.preservedEntityParameters!.includes(parameter) && !keptParameters.has(parameter),
          );

          if (lostQualifiers.length > 0) {
            const restoredPhrases = lostQualifiers.map(([, candidate]) => candidate.phrase);

            tracker.enter("qualifier-restore");
            tracker.exit("qualifier-restore", "restored", 0, undefined, { restored: restoredPhrases.join("; ") });

            const recursiveResult = await engine.execute({
              ...request,
              question: `${request.question} ${restoredPhrases.join(" ")}`,
              qualifierRestoreAttempted: true,
            });

            return { ...recursiveResult, trace: [...tracker.gates, ...(recursiveResult.trace ?? [])] };
          }
        }
      }

      // F5 safety gate: a recognized negation/exclusion marker was
      // detected in the query, but no mechanism anywhere downstream
      // (candidate representation, ExecutionPlan filters, SQL
      // templates) can safely represent negation/exclusion today.
      // Refuse honestly here, before any planning or SQL execution,
      // rather than silently treat the negated term as a positive
      // inclusion.
      if (semanticResult.unsupportedNegation) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error:
            "This question includes an exclusion or negation (e.g. \"excluding\", \"without\", \"except\", \"not\") that IntelligenceOS cannot yet safely represent. Please rephrase without excluding/negating a value.",
          answerability: { status: "not_directly_answerable" },
        };
      }

      // Phase 8.4: a `relationship` candidate (e.g. "above"/"below") with no `benchmark` candidate to compare
      // against cannot cohere - without this check the word is silently dropped and the query executes unfiltered,
      // a materially different answer returned as success. Refused here, reusing "candidate-inconsistent" (same
      // reason RCG-010's direction contradiction uses - both represent a candidate set that doesn't cohere).
      // 2,000 sweep (Batch E): with two or more named hospitals, "better than" compares them with each other; there
      // is no reference value to ask for.
      const namedRecords = semanticResult.matches.filter(
        (candidate) => candidate.semanticType === "entity" && (candidate.definition as EntityDefinition).identifiesUniqueRecord === true,
      ).length;

      if (hasRelationshipWithoutBenchmark(semanticResult.matches) && namedRecords < 2) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error:
            "This question compares against a reference value (e.g. \"above\", \"below\") but does not name one IntelligenceOS recognizes (e.g. \"national average\", \"state average\"). Please include the specific reference value you mean.",
          answerability: {
            status: "ambiguous",
            reason: "candidate-inconsistent",
          },
        };
      }

      // Tier0 Task 4 (F1): a more specific benchmark alias (e.g. "national average") can be silently broken by a
      // word inserted between its own words (e.g. "national mortality average") - PhraseExtractor only matches
      // contiguous spans, so a generic fallback alias resolves instead and the query executes against the wrong
      // benchmark with no signal. Refused here, reusing the same "candidate-inconsistent" reason as above.
      const subsumedBenchmarkRisk = detectSubsumedBenchmarkRisk(
        semanticResult.matches,
        semanticResult.normalizedQuery,
        runtime.domain.aliases,
      );

      if (subsumedBenchmarkRisk) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error:
            `This question mentions "${subsumedBenchmarkRisk.parentPhrase}", but the words aren't placed together, so I can't confirm you meant that specific comparison rather than a plain "${subsumedBenchmarkRisk.fallbackPhrase}". Please rephrase so "${subsumedBenchmarkRisk.parentPhrase}" appears together (e.g. "above the ${subsumedBenchmarkRisk.parentPhrase}").`,
          answerability: {
            status: "ambiguous",
            reason: "candidate-inconsistent",
          },
        };
      }

      // Fix Cycle 018 (Option A): pass the active domain's full,
      // already-declared metric list through opaquely, so QueryPlanner
      // can discover a domain-declared `comparable` set for a
      // metric-less multi-entity request. Universal Core never inspects
      // this list beyond the generic `comparable` flag.
      const plan = planner.createPlan(semanticResult, runtime.domain.metrics, request.forcedIntent, runtime.domain.entities);

    if (
  !plan.success ||
  !plan.plan ||
  plan.plan.semantic.metrics.length === 0
) {
  return {
    success: false,
    rows: [],
    rowCount: 0,
    // RCG-010: prefer a specific, natural-language reason (e.g. a
    // detected direction contradiction) when the planner supplied one.
    error: plan.error ?? "Unable to create query plan.",
    // Phase 8.1: plan.error is set only by RCG-010's direction-
    // contradiction check inside QueryPlanner.createPlan() - its presence
    // is the existing, generic signal distinguishing "the semantic
    // candidates contradict each other" from "there was nothing to plan
    // at all" (e.g. zero resolved metrics, even after Fix Cycle 018's
    // comparable-metric discovery).
    answerability: plan.error
      ? { status: "ambiguous", reason: "candidate-inconsistent" }
      : { status: "not_directly_answerable", reason: "semantic-incomplete" },
  };
}

// Phase 5.3: Create ExecutionPlan from QueryPlan
tracker.enter("execution-plan-building");
const executionPlan = executionPlanMapper.map(plan.plan);
capturedExecutionPlan = executionPlan;
tracker.exit("execution-plan-building", "ok", 0, undefined, {
  operation: executionPlan.operation,
  metric: executionPlan.metric,
  metricCount: executionPlan.metrics?.length ?? 1,
  filterCount: executionPlan.filters.length,
  filters: traceText(
    executionPlan.filters
      .map((filter) => `${filter.field} ${filter.operator} ${String(filter.value)}`)
      .join("; "),
  ),
  limit: executionPlan.limit?.value ?? "none",
});

console.log("========== EXECUTION PLAN ==========");
console.log(JSON.stringify(executionPlan, null, 2));
console.log("====================================");

// Pre-Phase 9 Tier0: a Domain SDK may only be able to detect certain
// ambiguities once every filter in the ExecutionPlan is known (e.g. a
// geographic scope filter whose value collides across states, with no
// state filter present to disambiguate it) - impossible to catch earlier,
// since identity ambiguity above is checked per-phrase, before filters
// are ever assembled together. Reuses the exact same Phase 8.3 targeted-
// clarification shape as the identityAmbiguities gate above: refused
// honestly, before any template selection or SQL execution (Phase 8.13:
// SQL_calls = 0), never a synthetic/unregistered template id.
tracker.enter("plan-ambiguity-check");
// Tier0 Task 2 (F8) frontend fix: a Layer 2 continuation Turn 2 that
// already resolved which specific identity the user meant (see
// RuntimeRequest.identityAlreadyResolved's own doc comment) must not
// chain into a further plan-level ambiguity clarification about that
// same, already-resolved identity - pending_interactions are bounded
// two-turn only. Every other gate below (metric/template/parameter)
// still runs normally for this request.
if (!request.identityAlreadyResolved && runtime.domain.executionStrategy.checkPlanAmbiguity) {
  const planAmbiguities = runtime.domain.executionStrategy.checkPlanAmbiguity(executionPlan);

  if (planAmbiguities && planAmbiguities.length > 0) {
    tracker.exit("plan-ambiguity-check", "ambiguous", 0, "ambiguous", { ambiguityCount: planAmbiguities.length });
    return {
      success: false,
      rows: [],
      rowCount: 0,
      error: buildClarificationMessage(planAmbiguities),
      answerability: {
        status: "ambiguous",
        reason: "identity-ambiguous",
        candidates: planAmbiguities.flatMap((ambiguity) => ambiguity.candidates ?? []),
      },
      // Tier0 Task 6 (F8 own-choice extension): same carry-forward as the
      // entity-identity-ambiguity gate above - this Turn's already-
      // resolved metric/concept candidates (e.g. "mortality-rate" +
      // "acute-myocardial-infarction" for "Mayo Clinic best AMI
      // mortality"), so a Layer 2 continuation's "own" choice can tell
      // whether a specific metric/condition was named at all.
      semanticMatches: semanticResult.matches,
    };
  }
}
tracker.exit("plan-ambiguity-check", "ok", 0, undefined, { ambiguityCount: 0 });

// Pre-Phase 8: observe (never correct) whether every semantically resolved candidate ended up represented in the
// plan just built. Uses the raw, pre-collection candidate list (semanticResult.matches) rather than
// plan.plan.semantic, since some semantic types (e.g. "concept") are dropped by SemanticCollector before
// QueryPlan.semantic even exists and would otherwise be invisible to this check.
// Phase 8.2: plan.plan.semantic (QueryPlanner's own already-filtered collections) is passed as a third input so
// the metric check can tell a candidate legitimately filtered out apart from one genuinely lost during planning.
const completeness = assessPlanCompleteness(
  semanticResult.matches,
  executionPlan,
  plan.plan.semantic,
);

console.log("========== PLAN COMPLETENESS ==========");
console.log(JSON.stringify(completeness, null, 2));
console.log("========================================");

// Phase 8.2: a genuinely unaccounted-for metric-type discrepancy - one that survived QueryPlanner's own legitimate
// filtering yet never reached the ExecutionPlan - is refused before any SQL executes.
// Phase 8.8: a concept-type discrepancy is gated the same way (not a new detector - assessPlanCompleteness()
// already computes it unconditionally, since SemanticCollector never collects "concept" into QueryPlan.semantic at
// all). Previously computed but never gated on, letting a recognized-but-unconsumed condition/topic (e.g. "...for
// heart attack specifically") silently execute against the metric's full, undifferentiated result. Category-type
// discrepancies (F13) stay detection-only - no comparable "always a discrepancy" guarantee for that branch.
const hasUnaccountedMetricOrConceptLoss = completeness.discrepancies.some(
  (discrepancy) => discrepancy.semanticType === "metric" || discrepancy.semanticType === "concept",
);

if (hasUnaccountedMetricOrConceptLoss) {
  return {
    success: false,
    rows: [],
    rowCount: 0,
    error:
      "This question resolved a measurement that could not be carried through to planning, so I can't safely answer it.",
    completeness,
    answerability: {
      status: "not_directly_answerable",
      reason: "plan-incomplete",
    },
  };
}

const primaryMetric =
  plan.plan.semantic.metrics[0]?.canonicalKey;

// Phase 5.3: Use ExecutionPlan if domain strategy supports it
const templateId = runtime.domain.executionStrategy.selectTemplateFromPlan
  ? runtime.domain.executionStrategy.selectTemplateFromPlan(executionPlan)
  : runtime.domain.executionStrategy.selectTemplate(
      primaryMetric!,
      plan.plan.intent,
    );

tracker.enter("capability-template-availability");
const template =
  runtime.sqlResolver.resolve(
    templateId,
  );

  console.log("========== RUNTIME ==========");
console.log("Metrics:", plan.plan.semantic.metrics);
console.log("Primary Metric:", primaryMetric);
console.log("Requested Template:", templateId);

if (template.template) {
  console.log("Resolved Template:", template.template.id);
  console.log(
    "Parameters:",
    template.template.parameters,
  );
}

      // Phase 8.5: candidates resolved and mapped cleanly, but no deterministic execution mechanism exists for the
      // requested shape (the Domain SDK never registered a template under this id) - simple absence of a
      // capability, not an ambiguity. Refused before any parameter resolution or SQL.
      // Phase 8.10 Layer 1: when Phase 8.9 discovered supported alternatives, build a truthful guidance message
      // from the Domain-owned metric labels instead of a bare technical error.
      if (!template.found || !template.template) {
        const alternatives = discoverAlternatives(primaryMetric!, executionPlan, runtime);
        const guidanceMessage = buildGuidanceMessage(
          {
            status: "not_directly_answerable",
            reason: "capability-unavailable",
            ...(alternatives.length > 0 ? { alternatives } : {}),
          },
          runtime.domain.metrics,
        );

        tracker.exit("capability-template-availability", "unavailable", 0, "not_directly_answerable", {
          templateId: String(templateId),
          reason: "not-registered",
        });
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: guidanceMessage ?? "SQL template not found.",
          answerability: {
            status: "not_directly_answerable",
            reason: "capability-unavailable",
            ...(alternatives.length > 0 ? { alternatives } : {}),
          },
        };
      }

      // Phase 8.5: a template was registered under the requested id, but
      // the Domain SDK has explicitly marked it unusable
      // (`SqlTemplateDefinition.enabled === false`) - a declared-but-
      // unwired Universal contract field until now. Distinct from
      // template-not-found above only in that a registration exists;
      // the outcome (no SQL, capability-unavailable) is identical.
      //
      // Phase 8.10 Layer 1: same guidance behavior as template-not-found
      // above - alternatives discovered by Phase 8.9, labels from Domain
      // metrics, truthful presentation.
      if (template.template.enabled === false) {
        const alternatives = discoverAlternatives(primaryMetric!, executionPlan, runtime);
        const guidanceMessage = buildGuidanceMessage(
          {
            status: "not_directly_answerable",
            reason: "capability-unavailable",
            ...(alternatives.length > 0 ? { alternatives } : {}),
          },
          runtime.domain.metrics,
        );

        tracker.exit("capability-template-availability", "unavailable", 0, "not_directly_answerable", {
          templateId: String(templateId),
          reason: "disabled",
        });
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: guidanceMessage ?? "This capability is not currently available.",
          answerability: {
            status: "not_directly_answerable",
            reason: "capability-unavailable",
            ...(alternatives.length > 0 ? { alternatives } : {}),
          },
        };
      }

// Phase 5.3: Use ExecutionPlan if domain strategy supports it
tracker.exit("capability-template-availability", "ok", 0, undefined, {
  templateId: String(templateId),
  templateName: template.template.name,
});

const parameters = runtime.domain.executionStrategy.resolveParametersFromPlan
  ? runtime.domain.executionStrategy.resolveParametersFromPlan(executionPlan)
  : runtime.domain.executionStrategy.resolveParameters(
      plan.plan.parameters,
    );

console.log("========== PARAMETERS ==========");
console.log(parameters);
console.log("================================");

// Phase 8.8: the plan may be complete per assessPlanCompleteness() yet the selected template still can't honor one
// of its filters - e.g. a scalar "=" filter reaching an unscoped template with no backing parameter (F8), or a
// multi-value "in" filter reaching a parameter never declared "array"-typed (the only shape SqlExecutor's array
// rendering is safe for). Checked by VALUE (valuesMatch()), not name, so this stays Domain-agnostic despite a
// Domain's own parameter renaming. Refused before any SQL runs, reusing the Phase 8.7 fallback reasoning (no new
// answerability reason needed).
// Tier1 Task 5: applied uniformly to every operation, not just "rank"/"aggregate" - safe because
// isFilterCompatibleWithTemplate() only ever flags "in" filters (an unrepresented scalar "=" is always left alone),
// so a lookup/compare's redundant coarser filter (e.g. "state" beside an already-identifying "hospital") stays
// unaffected, while a genuinely unsafe multi-value "in" filter is now also caught for lookup/compare, closing a
// live Phase 8.13 violation where such a request leaked a raw DB error despite a `not_directly_answerable` result.
const templateParameters = template.template.parameters ?? [];

tracker.enter("parameter-filter-compatibility");
const incompatibleFilterCount = executionPlan.filters.filter(
  (filter) => !isFilterCompatibleWithTemplate(filter, parameters, templateParameters),
).length;
const hasIncompatibleFilter = incompatibleFilterCount > 0;

if (hasIncompatibleFilter) {
  tracker.exit("parameter-filter-compatibility", "incompatible", 0, "not_directly_answerable", {
    incompatibleFilterCount,
    boundParameters: describeParameters(parameters),
  });
  return {
    success: false,
    rows: [],
    rowCount: 0,
    error: "This request's constraints cannot be safely represented by the available execution capability.",
    answerability: {
      status: "not_directly_answerable",
    },
  };
}

tracker.exit("parameter-filter-compatibility", "ok", 0, undefined, {
  incompatibleFilterCount: 0,
  boundParameters: describeParameters(parameters),
});

// Tier0 Task 3 Full Fix ("Gate 6"): a required template parameter with
// no resolved value (e.g. an entity that never resolved at all, or
// resolved to an ambiguity Universal Core already reported elsewhere)
// must never reach SqlExecutor, whose own required-parameter guard
// throws a raw, internal string (e.g. "Missing required parameter:
// hospitalId") - accurate for debugging, meaningless and un-actionable
// for a user. Checked generically by declared template shape, not by
// any Domain-specific parameter name, so this stays Domain-agnostic.
const missingRequiredParameter = templateParameters.some(
  (parameter) =>
    parameter.required &&
    (parameters[parameter.name] === undefined || parameters[parameter.name] === null),
);

if (missingRequiredParameter) {
  return {
    success: false,
    rows: [],
    rowCount: 0,
    error:
      "I don't have enough specific information to identify exactly which record this question refers to. Please include more identifying detail (such as a full name or location) and try again.",
    answerability: {
      status: "not_directly_answerable",
    },
  };
}

tracker.enter("deterministic-warehouse-execution");

// Tier1 Task 6 regression fix (bug 3 - production latency): a dry-run
// request (suggestion candidate validation only) never touches the
// warehouse. Every gate above this line has already run for real
// (semantic resolution, planning, template/capability selection, filter
// compatibility) - reaching this point means the candidate cleared every
// one of those checks, i.e. it "would be answerable." Returns a
// synthetic successful result instead of calling the executor - see
// RuntimeRequest.dryRun's own doc comment for the accepted trade-off.
if (request.dryRun) {
  tracker.exit("deterministic-warehouse-execution", "dry-run", 0, undefined, {
    templateId: String(templateId),
  });
  return {
    success: true,
    rows: [],
    rowCount: 1,
    answerability: { status: "answerable" },
  };
}

const primaryResult = await executor.execute(
  template.template,
  parameters,
);
tracker.exit(
  "deterministic-warehouse-execution",
  primaryResult.success ? "ok" : "failed",
  1,
  undefined,
  {
    templateId: String(templateId),
    rowCount: primaryResult.rowCount,
    boundParameters: describeParameters(parameters),
  },
);

// Phase 8.7: every prior gate above already attaches its own specific
// AnswerabilityResult before returning. A primary execution failure
// (e.g. a SQL-level parameter/adapter error) is the one remaining path
// that reaches this function's caller with none - SqlExecutionResult
// (packages/sql-executor) has no answerability field of its own.
// Attached generically, with no reason: none of the existing reason
// values accurately describes a raw executor-level rejection, and
// inventing one here would be exactly the speculative taxonomy growth
// the Phase 8.7 audit rejected. This never overwrites anything -
// primaryResult never carries an answerability field to begin with.
if (!primaryResult.success) {
  return {
    ...primaryResult,
    answerability: { status: "not_directly_answerable" },
  };
}

// Phase 8.6B: POST-HOC reclassification of an already-successful, already-real result (not a new query/refusal
// mechanism) - a zero-row result is data-unavailable ONLY when all hold, so an ordinary empty list/ranking/
// aggregate (e.g. "hospitals in Wyoming" matching nothing) is never misclassified: (1) operation is single-record
// "lookup"; (2) exactly one entity resolved (not zero, not Phase 7.5's multi-entity comparison); (3) the template
// declares `singleEntityRecord: true` - this result represents that one entity's own record, not an enumeration.
if (primaryResult.rowCount === 0 && executionPlan.operation === "lookup") {
  const resolvedEntityCandidates = semanticResult.matches.filter(
    (candidate) => candidate.semanticType === "entity",
  );

  if (
    resolvedEntityCandidates.length === 1 &&
    template.template.singleEntityRecord === true
  ) {
    return {
      ...primaryResult,
      success: false,
      error: "No data is available for the requested entity and metric.",
      answerability: {
        status: "not_directly_answerable",
        reason: "data-unavailable",
      },
    };
  }
}

// Phase 8.6C: purely evidentiary, policy-neutral population-coverage
// measurement. Scoped narrowly to "rank"/"aggregate" operations only -
// a "lookup" (8.6B's own territory) never reaches here with a
// coverage-eligible shape, and every other operation is left
// untouched. Computed from a Domain-declared companion query (see
// SqlTemplateDefinition.coverageTemplateId), using the exact same
// request-scope parameters already resolved for the primary
// execution - never the primary result's own returned rows/identity
// values, which would silently reintroduce a Top-N-shaped error (the
// companion query has no LIMIT and must never be confused with how
// many rows the primary query happened to return).
const coverageFacts: CoverageFact[] = [];

async function collectCoverageFact(
  metric: string,
  coverageTemplateId: string | undefined,
): Promise<void> {
  if (!coverageTemplateId) {
    return;
  }

  const coverageTemplate = runtime.sqlResolver.resolve(coverageTemplateId);

  if (!coverageTemplate.found || !coverageTemplate.template) {
    console.log(
      `========== PHASE 8.6C: coverage template "${coverageTemplateId}" not found - omitting coverage for "${metric}" ==========`,
    );
    return;
  }

  try {
    const coverageResult = await executor.execute(coverageTemplate.template, parameters);

    if (!coverageResult.success) {
      console.log(
        `========== PHASE 8.6C: coverage query for "${metric}" failed - omitting coverage: ${coverageResult.error ?? "unknown error"} ==========`,
      );
      return;
    }

    const coverageRow = (coverageResult.rows as Record<string, unknown>[])[0];

    const eligibleCount = Number(coverageRow?.eligible_count);
    const coveredCount = Number(coverageRow?.covered_count);

    if (!Number.isFinite(eligibleCount) || !Number.isFinite(coveredCount)) {
      console.log(
        `========== PHASE 8.6C: coverage query for "${metric}" returned an unexpected shape - omitting coverage ==========`,
      );
      return;
    }

    coverageFacts.push({ metric, eligibleCount, coveredCount });
  } catch (error) {
    console.log(
      `========== PHASE 8.6C: coverage query for "${metric}" threw - omitting coverage: ${error instanceof Error ? error.message : String(error)} ==========`,
    );
  }
}

if (executionPlan.operation === "rank" || executionPlan.operation === "aggregate") {
  await collectCoverageFact(executionPlan.metric, template.template.coverageTemplateId);
}

// Phase 7: multi-metric secondary execution.
//
// The primary execution above is unchanged and still establishes the
// result spine: row order, limit, and the primary metric's own values.
// Secondary metrics (if any) are fetched ONLY for the exact identity
// values the primary query already returned - never independently
// ranked or limited - then merged onto those same primary rows.
const strategy = runtime.domain.executionStrategy;
const identityField = strategy.resultIdentityField;

if (
  executionPlan.metrics &&
  executionPlan.metrics.length > 1 &&
  identityField &&
  strategy.selectSecondaryMetricTemplate &&
  strategy.resolveSecondaryMetricParameters
) {
  const primaryRows = primaryResult.rows as Record<string, unknown>[];

  const identityValues = primaryRows
    .map((row) => row[identityField])
    .filter((value) => value !== undefined && value !== null);

  // Preserve the existing metric order; the primary metric is excluded
  // since it was already executed above.
  const secondaryMetrics = executionPlan.metrics.filter(
    (metric) => metric.metric !== executionPlan.metric,
  );

  console.log("========== PHASE 7: SECONDARY METRICS ==========");
  console.log("Identity field:", identityField);
  console.log("Identity values:", identityValues);
  console.log("Secondary metrics:", secondaryMetrics);
  console.log("==================================================");

  for (const secondaryMetric of secondaryMetrics) {
    const secondaryTemplateId = strategy.selectSecondaryMetricTemplate(
      secondaryMetric,
      executionPlan,
    );

    const secondaryTemplate = runtime.sqlResolver.resolve(secondaryTemplateId);

    if (!secondaryTemplate.found || !secondaryTemplate.template) {
      // A requested metric must never silently disappear from a "successful" response - fail the whole request,
      // naming exactly which metric could not be resolved (Phase 8.7 attaches an AnswerabilityResult here, same as
      // the primary-execution fallback). Phase 8.9: the failure stays atomic; the only addition is discovering
      // alternatives for THIS secondary metric via the same unmodified discoverAlternatives() the primary gate
      // uses - the already-computed primary result is discarded along with the rest of this failure, as before.
      // Phase 8.10 Layer 1: when alternatives exist, build a truthful guidance message naming them.
      const alternatives = discoverAlternatives(secondaryMetric.metric, executionPlan, runtime);
      const guidanceMessage = buildGuidanceMessage(
        {
          status: "not_directly_answerable",
          reason: "capability-unavailable",
          ...(alternatives.length > 0 ? { alternatives } : {}),
        },
        runtime.domain.metrics,
      );

      return {
        success: false,
        rows: [],
        rowCount: 0,
        error: guidanceMessage ?? `SQL template not found for requested metric "${secondaryMetric.metric}".`,
        answerability: {
          status: "not_directly_answerable",
          reason: "capability-unavailable",
          ...(alternatives.length > 0 ? { alternatives } : {}),
        },
      };
    }

    // Phase 8.6C: this secondary metric's own coverage, if its template
    // declares one, is computed against the SAME request-scope
    // `parameters` used for the primary metric above - never the
    // primary result's own `identityValues` (that subset is exactly
    // what Section 15/16 of the Phase 8.6C design forbids using as a
    // coverage denominator).
    if (executionPlan.operation === "rank" || executionPlan.operation === "aggregate") {
      await collectCoverageFact(secondaryMetric.metric, secondaryTemplate.template.coverageTemplateId);
    }

    const secondaryParameters = strategy.resolveSecondaryMetricParameters(
      secondaryMetric,
      executionPlan,
      identityValues,
    );

    const secondaryResult = await executor.execute(
      secondaryTemplate.template,
      secondaryParameters,
    );

    if (!secondaryResult.success) {
      // Same principle: a metric that was requested but failed to
      // execute must fail the whole request, not vanish quietly.
      //
      // Phase 8.7: same generic fallback as above - never attached an AnswerabilityResult before.
      // Tier1 Task 6: a genuine execution-time failure (template exists, unlike the capability-unavailable gates
      // above) - `secondaryResult.error` is a raw SQL/adapter error string and must never reach the user verbatim,
      // so it's replaced with a generic, non-leaking message (raw detail stays server-side via logging).
      return {
        success: false,
        rows: [],
        rowCount: 0,
        error: "I couldn't retrieve one of the requested measures right now. Please try again or ask about a single measure.",
        answerability: { status: "not_directly_answerable" },
      };
    }

    const secondaryRows = secondaryResult.rows as Record<string, unknown>[];

    const secondaryIndex = new Map<unknown, Record<string, unknown>>();

    for (const row of secondaryRows) {
      secondaryIndex.set(row[identityField], row);
    }

    for (const row of primaryRows) {
      const match = secondaryIndex.get(row[identityField]);

      // No match is NOT a failure - it means this specific row
      // genuinely has no data for this metric. The field is simply
      // left absent on that one row, an honest data fact rather than
      // an execution failure.
      if (match) {
        for (const [key, value] of Object.entries(match)) {
          if (key !== identityField) {
            row[key] = value;
          }
        }
      }
    }
  }
}

// 2,000 sweep (Batch E): "top 5" / "bottom 3" - every ranking template returns up to 10 rows (rank_within_scope <= 10),
// so a smaller count the user asked for trims the one ranked list (template ids ending "-ranking"; "the 3 safest" is
// planned as a lookup but still ranks). Groupings ("-ranking-by-state"), comparisons ("-by-facility-ids") and multi-state
// rankings (5 per state) are left whole. A count above what came back changes nothing.
const count = templateId.endsWith("-ranking") && (parameters as Record<string, unknown>).multiState !== true
  ? requestedCount(request.rewrittenFrom ?? request.question)
  : undefined;

if (count !== undefined && count < primaryResult.rows.length) {
  primaryResult.rows = primaryResult.rows.slice(0, count);
  primaryResult.rowCount = primaryResult.rows.length;
}

return {
  ...primaryResult,
  completeness,
  answerability: { status: "answerable" },
  ...(coverageFacts.length > 0 ? { coverage: coverageFacts } : {}),
  executedParameters: parameters as Record<string, unknown>,
};
      };

      // LLM Integration Layer 0.5 (feature-flagged, isLlmFirstFrontDoorEnabled()): tries `llmFallback` BEFORE the
      // deterministic pipeline's first attempt, not just on failure - catches rewrites that would otherwise return
      // success:true with silently wrong data (e.g. an unaliased phrase resolving to the wrong thing).
      // Skipped for: Layer-2 continuations (already-structured, not free text), suggestion dry-runs, and a request
      // that already went through this path (`llmFallbackAttempted`).
      // Two bypasses, both latency-only (Phase 8 still gates whatever text results either way): an exact unique-
      // record match (e.g. a named hospital) needs no normalization; and `planner.isFullyUnderstood()` - a question
      // every word of which the deterministic layers already resolved has nothing left for an LLM to fix.
      // A rewrite is never trusted directly - it's re-run through this engine's full pipeline from the top
      // (`llmFallbackAttempted: true`), exactly as if the user had typed the canonical phrasing themselves.
      // Dry-run parity: a suggestion chip is refused (0 SQL) whenever the same text would reach the model here, so
      // a chip can never pass validation on the deterministic path and then fail differently once actually clicked.
      if (
        request.dryRun &&
        llmFallback &&
        !request.identityAlreadyResolved &&
        !request.forcedIdentityCandidate &&
        !request.forcedIntent &&
        !request.companionEntities &&
        isLlmFirstFrontDoorEnabled()
      ) {
        const resolved = semantic.resolve(request.question);
        const hasUniqueRecordMatch = resolved.matches.some(
          (candidate) =>
            candidate.semanticType === "entity" &&
            (candidate.definition as EntityDefinition).identifiesUniqueRecord === true,
        );

        if (!hasUniqueRecordMatch && !planner.isFullyUnderstood(resolved.normalizedQuery, resolved.matches, runtime.domain.entities)) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: "A suggestion must be answerable exactly as written.",
            answerability: { status: "not_directly_answerable" },
          };
        }
      }

      let preNormalizeAttempted = false;
      let pendingClarification: string | undefined;
      let declinedTerms: readonly string[] | undefined;

      if (
        llmFallback &&
        !request.llmFallbackAttempted &&
        !request.dryRun &&
        !request.identityAlreadyResolved &&
        !request.forcedIdentityCandidate &&
        !request.forcedIntent &&
        !request.companionEntities &&
        isLlmFirstFrontDoorEnabled()
      ) {
        const resolved = semantic.resolve(request.question);
        const hasUniqueRecordMatch = resolved.matches.some(
          (candidate) =>
            candidate.semanticType === "entity" &&
            (candidate.definition as EntityDefinition).identifiesUniqueRecord === true,
        );
        const fullyUnderstood = planner.isFullyUnderstood(resolved.normalizedQuery, resolved.matches, runtime.domain.entities);

        if (!hasUniqueRecordMatch && !fullyUnderstood) {
          // ConversationalFix (2026-09-27): tried before the paid normalizer, never after - see
          // tryConversationalCheck's own doc comment above.
          const conversationalResult = await tryConversationalCheck();
          if (conversationalResult) {
            return conversationalResult;
          }

          preNormalizeAttempted = true;
          tracker.enter("llm-normalization");
          const rewrite = await llmFallback(request.question);
          const rewriteMeta = rewrite?.meta;

          if (
            rewrite &&
            "canonicalQuestion" in rewrite &&
            rewrite.canonicalQuestion !== request.question
          ) {
            // Batch 1 (D3): the trace records what the question was rewritten
            // to, so a wrong rewrite can be attributed from the live response.
            tracker.exit("llm-normalization", "rewritten", 0, undefined, {
              ...rewriteMeta,
              canonicalQuestion: rewrite.canonicalQuestion.slice(0, 300),
            });
            // The recursive call below builds its OWN fresh tracker (a
            // new request/response cycle for the rewritten text) - its
            // own trace would otherwise start silently after this
            // request's "llm-normalization" step with no record that
            // step ever happened. Stitching this tracker's own gates
            // onto the front of the recursive result's trace keeps the
            // full picture visible end-to-end without threading a new
            // field through RuntimeRequest.
            const recursiveResult = await engine.execute({
              ...request,
              question: rewrite.canonicalQuestion,
              llmFallbackAttempted: true,
              rewrittenFrom: request.question,
            });
            return {
              ...recursiveResult,
              trace: [...tracker.gates, ...(recursiveResult.trace ?? [])],
            };
          }

          if (rewrite && "clarification" in rewrite) {
            pendingClarification = rewrite.clarification;
            tracker.exit("llm-normalization", "clarification", 0, undefined, rewriteMeta);
          } else if (rewrite && "canonicalQuestion" in rewrite) {
            tracker.exit("llm-normalization", "unchanged", 0, undefined, rewriteMeta);
          } else if (rewrite && "unsupportedTerms" in rewrite) {
            // Batch 1 (D2 / D3): a binding decline - refuse below with 0 SQL and
            // show which terms the LLM could not map.
            declinedTerms = rewrite.unsupportedTerms;
            tracker.exit("llm-normalization", "unsupported", 0, undefined, {
              ...rewriteMeta,
              unsupportedTerms: rewrite.unsupportedTerms.join("; ").slice(0, 300),
            });
          } else {
            // All configured providers failed, timed out, or returned a
            // response that could not be parsed into the expected shape
            // (see llm-model-gateway.ts's own runChain() - a provider
            // that responds but ignores the "JSON only" instruction now
            // advances to the next tier instead of failing outright, but
            // if every tier is exhausted or quota-limited, this is the
            // visible result). Falls through to the deterministic
            // pipeline on the original, unmodified question - never a
            // crash, never a fabricated result.
            tracker.exit("llm-normalization", "unavailable", 0, undefined, rewriteMeta);
          }

          // Batch 5A-1: no rewrite came out of the front door (a clarification, `unchanged` or `unavailable`), so the
          // pipeline runs on the raw text; the words the front door was consulted for are guarded (runPipeline).
          if (!declinedTerms) {
            // A word the domain's own lexical rewrites name ("hosptials", "huston") is one it corrects and understands,
            // even though the rewrite chain consumed the corrected text rather than the typed one: not a dropped word.
            const rewriteWords = new Set(
              (runtime.domain.lexicalRewrites ?? []).flatMap((rule) => rule.pattern.toLowerCase().split(/\s+/)),
            );
            frontDoorUnaccounted = planner
              .findUnaccountedWords(resolved.normalizedQuery, resolved.matches, runtime.domain.entities)
              .filter((word) => !rewriteWords.has(word));
          }
        } else if (unsupportedPrecheck) {
          // Batch 5C: the question skipped the front door (a named entity, or every word already understood), so the
          // domain's deterministic scope check that lives in the front door has not run. Run it here, on what is left of the
          // question once the entities' own words are removed. Same refusal, same trace entry as the front door's own.
          const topics = unsupportedPrecheck(withoutEntityPhrases(resolved.normalizedQuery, resolved.matches));

          if (topics.length > 0) {
            declinedTerms = topics;
            tracker.enter("llm-normalization");
            tracker.exit("llm-normalization", "unsupported", 0, undefined, {
              source: "pre-check",
              unsupportedTerms: topics.join("; ").slice(0, 300),
            });
          }
        }
      }

      // Batch 1 (D2): an LLM decline that named unsupported terms is refused
      // here (0 SQL, the same `semantic-incomplete` refusal as the dead end
      // above) rather than run through the pipeline on the raw text.
      let result: RuntimeResult = declinedTerms
        ? {
            success: false,
            rows: [],
            rowCount: 0,
            error: "Unable to resolve question.",
            answerability: { status: "not_directly_answerable", reason: "semantic-incomplete" },
          }
        : await runPipeline();

      // LLM Integration Layer 1 (Messy Input Normalizer): fires on any non-ambiguous failure (PrePhase 9.5 broadened
      // this from only "semantic-incomplete", since typo/near-miss questions also fail at capability-unavailable
      // and missing-parameter gates). "ambiguous" is excluded - it already has its own clarification flow.
      // The rewrite is never trusted directly: a fresh engine.execute() re-runs the ENTIRE pipeline, so Rule 21/22
      // and Phase 8.13 hold as they would for a user typing the canonical phrasing; if it doesn't help, the
      // ORIGINAL result is returned unchanged. Skipped when Layer 0.5 already spent this request's one LLM attempt
      // (`preNormalizeAttempted`), and for dry-runs (`!request.dryRun`) - a dry-run candidate fails on a capability
      // gap, never wording, so normalizing it would just waste a ~3.8K-token call (measured ~40% of queries).
      if (
        preNormalizeAttempted &&
        pendingClarification &&
        !result.success &&
        result.answerability?.status !== "ambiguous"
      ) {
        result = { ...result, error: pendingClarification };
      } else if (
        !result.success &&
        result.answerability?.status !== "ambiguous" &&
        llmFallback &&
        !request.llmFallbackAttempted &&
        !preNormalizeAttempted &&
        !request.dryRun
      ) {
        // ConversationalFix (2026-09-27): the Layer 1 (on-failure) mirror of the Layer 0.5 check above - reached
        // when a question was trivially "fully understood" (no unaccounted words left to send to Layer 0.5, e.g.
        // every word is filler) yet still failed deterministic resolution outright ("what's up" has nothing left
        // to account for and nothing to resolve either).
        const conversationalResult = await tryConversationalCheck();
        if (conversationalResult) {
          return conversationalResult;
        }

        const rewrite = await llmFallback(request.question);
        if (
          rewrite &&
          "canonicalQuestion" in rewrite &&
          rewrite.canonicalQuestion !== request.question
        ) {
          // Batch 5A-1: this rewrite is recorded in the trace exactly like a Layer 0.5 one (it was not before), so
          // what answered it (a layperson-vocabulary mapping, a model tier), what it was rewritten to and the note /
          // alternatives that come with it reach the caller.
          tracker.enter("llm-normalization");
          tracker.exit("llm-normalization", "rewritten", 0, undefined, {
            ...rewrite.meta,
            canonicalQuestion: rewrite.canonicalQuestion.slice(0, 300),
          });
          const recursiveResult = await engine.execute({
            ...request,
            question: rewrite.canonicalQuestion,
            llmFallbackAttempted: true,
            rewrittenFrom: request.question,
          });
          return {
            ...recursiveResult,
            trace: [...tracker.gates, ...(recursiveResult.trace ?? [])],
          };
        }
        // PrePhase 9.5: the LLM can determine a rewrite isn't safe to
        // guess (e.g. a bare filter/list question with no geographic
        // scope, where inventing a state would silently narrow what the
        // user actually asked for) and instead hands back its own
        // natural-language clarifying question. Surfacing that verbatim
        // (instead of the gate's original raw/blunt error string) is
        // what makes this a graceful "which state?" follow-up rather
        // than a dead-end technical failure - the ChatGPT-style behavior
        // this batch was asked for. `result.success` stays false and
        // `answerability` is untouched: this is strictly a friendlier
        // error message, never a fabricated success.
        // Batch 5C: a comparison names two things. When the model wants to ask "which measure?" but a capitalised name in the
        // question resolved to nothing, that thing does not exist: nothing is asked, the question is refused and the unknown
        // words are named (0 SQL), instead of asking about a comparison that cannot be made. The model's clarification is then
        // traced as not used ("unavailable"). Only a clarification the model gave for a plan that is a comparison is affected.
        const unknownNames: string[] =
          rewrite && "clarification" in rewrite && capturedExecutionPlan?.operation === "compare"
            ? (() => {
                const resolvedAgain = semantic.resolve(request.question);
                const capitalised = new Set(
                  request.question
                    .split(/[^\p{L}\p{N}]+/u)
                    .filter(Boolean)
                    .slice(1)
                    .filter((token) => /^\p{Lu}/u.test(token))
                    .map((token) => token.toLowerCase()),
                );

                return planner
                  .findUnaccountedWords(resolvedAgain.normalizedQuery, resolvedAgain.matches, runtime.domain.entities)
                  .filter((word) => capitalised.has(word));
              })()
            : [];

        // Batch 5A-2: what the front door said about a question it did not rewrite is recorded like a Layer 0.5 outcome (it
        // was not), so the caller can echo what was asked instead of the generic dead end. Recording only: nothing here
        // changes the decision or the message.
        if (rewrite) {
          tracker.enter("llm-normalization");
          tracker.exit(
            "llm-normalization",
            "clarification" in rewrite && unknownNames.length === 0 ? "clarification" : "unsupportedTerms" in rewrite ? "unsupported" : "unavailable",
            0,
            undefined,
            {
              ...rewrite.meta,
              ...("unsupportedTerms" in rewrite ? { unsupportedTerms: rewrite.unsupportedTerms.join("; ").slice(0, 300) } : {}),
            },
          );
        }
        if (unknownNames.length > 0) {
          tracker.enter("unaccounted-word-guard");
          tracker.exit("unaccounted-word-guard", "refused", 0, "not_directly_answerable", {
            unaccountedWords: unknownNames.join(" "),
          });
          result = {
            success: false,
            rows: [],
            rowCount: 0,
            error: "Unable to resolve question.",
            answerability: { status: "not_directly_answerable", reason: "semantic-incomplete" },
          };
        } else if (rewrite && "clarification" in rewrite) {
          result = { ...result, error: rewrite.clarification };
        }
      }

      // sqlCalls is 0 here on purpose: the warehouse gate already records the real SQL count, so summing the trace
      // counts each query once. The row count travels in detail instead of the SQL-call slot.
      tracker.exit(
        "response",
        result.success ? "ok" : "refused",
        0,
        result.answerability?.status,
        { rowCount: result.rowCount ?? 0 },
      );

      const finalResult: RuntimeResult = {
        ...result,
        trace: tracker.gates,
        ...(capturedExecutionPlan && !result.executionPlan ? { executionPlan: capturedExecutionPlan } : {}),
      };

      // Batch 5A-1: hand the caller the answer before the suggestions are built (see RuntimeRequest.onResult).
      request.onResult?.(finalResult);

      // Tier1 Task 6: opt-in only (see RuntimeRequest.includeSuggestions's
      // own doc comment for why) - a request that doesn't ask for
      // suggestions (every pre-existing caller, and the dry-run
      // validation call below on each candidate) gets none, unchanged
      // from pre-Tier1-T6 behavior. Also requires the domain to have
      // implemented the optional hook at all.
      if (!request.includeSuggestions || !runtime.domain.executionStrategy.generateSuggestions) {
        return finalResult;
      }

      const suggestionContext: SuggestionContext = {
        question: request.question,
        success: finalResult.success,
        rowCount: finalResult.rowCount,
        rows: finalResult.rows as readonly Record<string, unknown>[],
        ...(capturedExecutionPlan ? { executionPlan: capturedExecutionPlan } : {}),
        ...(finalResult.answerability ? { answerability: finalResult.answerability } : {}),
      };

      const candidateQuestions = await runtime.domain.executionStrategy.generateSuggestions(
        suggestionContext,
      );

      // Tier1 T6 regression fix (bug 1): an identity-ambiguous
      // candidate is a CONTINUATION TOKEN (e.g. a bare city name), not a
      // standalone question - it is only meaningful when matched against
      // THIS response's own `answerability.candidates` by
      // matchClarificationResponse() (see continuation.ts), and running
      // it through a fresh top-level execute() would almost always fail
      // semantic resolution on its own, dropping every candidate. The
      // Domain's own generator already proved uniqueness against the
      // same candidates[] before returning these (see
      // suggestion-generator.ts's own doc comment) - trusted directly,
      // no dry-run.
      const isIdentityAmbiguous =
        finalResult.answerability?.status === "ambiguous" &&
        finalResult.answerability?.reason === "identity-ambiguous";

      if (isIdentityAmbiguous) {
        // Phase 3.5: every option of a clarification is offered - a county in 4 states showed 3 ("Washington" was
        // missing); the options are the domain's continuation tokens, one per candidate the clarification names.
        return { ...finalResult, suggestions: candidateQuestions };
      }

      const suggestions: string[] = [];

      for (const candidate of candidateQuestions) {
        if (suggestions.length >= 3) {
          break;
        }

        if (suggestions.includes(candidate) || candidate === request.question) {
          continue;
        }

        // Tier1 T6 regression fix (bug 3 - production latency): validates each candidate with `dryRun: true`, which
        // runs the full pipeline but returns BEFORE actual SQL execution - proving answerability without a live
        // warehouse round-trip. `includeSuggestions` is omitted so a candidate never recursively spawns its own.
        // Accepted trade-off: proves "would be answerable," not "returns 1+ real rows" - mitigated by candidates
        // only being drawn from patterns already known to have real data, spot-checked by
        // scripts/verify-tier1-t6-suggestions-fix.ts.
        const trial = await engine.execute({
          question: candidate,
          dryRun: true,
        });

        if (trial.success) {
          suggestions.push(candidate);
        }
      }

      return { ...finalResult, suggestions };
    },
  };

  return engine;
}
