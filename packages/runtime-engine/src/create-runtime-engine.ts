import type { DomainRuntime } from "@intelligence/domain-runtime";
import type { QueryPlanner, ExecutionPlanMapper } from "@intelligence/query-planner";
import { assessPlanCompleteness, hasRelationshipWithoutBenchmark, detectSubsumedBenchmarkRisk } from "@intelligence/query-planner";
import type { SqlExecutor } from "@intelligence/sql-executor";
import type { SemanticResolver } from "@intelligence/semantic";
import type { ExecutionPlan, ExecutionFilter } from "@intelligence/contracts";
import type { EntityDefinition, MetricDefinition, SqlTemplateParameter, SuggestionContext } from "@intelligence/domain-sdk";

import type { RuntimeEngine } from "./runtime-engine";
import type { RuntimeRequest } from "./runtime-request";
import type { RuntimeResult } from "./runtime-result";
import type { CoverageFact } from "./coverage-fact";
import { buildClarificationMessage } from "./build-clarification-message";
import { buildGuidanceMessage } from "./build-guidance-message";
import { PhaseGateTracker, type PhaseGateDetail } from "./phase-gate-tracker";

/**
 * Phase 8.8: structural equality for a filter's resolved value against a
 * candidate parameter's resolved value - deliberately not `===` alone,
 * since Domain-owned parameter resolution (e.g. Healthcare's own
 * "hospital" -> "hospitalId"/"facilityIds" renaming) may copy a filter's
 * value under a different parameter name. Comparing by VALUE, not by
 * NAME, is what lets this stay Domain-agnostic: Universal Core never
 * needs to know any Domain's renaming convention, only that a filter's
 * value must actually reach *some* parameter the selected template
 * declares, under whatever name that Domain gave it.
 */
function valuesMatch(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  return a === b;
}

/**
 * Phase 8.8: a single filter is compatible with a candidate template when
 * some parameter that template declares resolves (by value, see
 * valuesMatch()) to that filter's value, and - for a multi-value "in"
 * filter - that parameter is declared "array"-typed (the only shape
 * SqlExecutor's array rendering is safe for). Factored out unchanged from
 * the original Phase 8.8 gate so Phase 8.9's alternative discovery can
 * reuse the exact same mechanism against a candidate metric's own
 * template, rather than a second implementation of the same rule.
 *
 * Tier1 Task 5 (Phase 1): only an "in"-operator filter can ever be
 * incompatible. A scalar "=" filter with no matching template parameter
 * is left alone (return true) - this is deliberately unconditional,
 * unrelated to operation type, so a redundant, coarser scalar filter
 * alongside an already-resolved identity (e.g. a "state" filter beside a
 * "hospital" filter that already uniquely determines the record) is
 * never treated as incompatible, exactly as before. This is what makes
 * it safe to apply this same check to every operation - previously the
 * caller had to scope it to "rank"/"aggregate" only to avoid that exact
 * false positive on "lookup"/"compare".
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
 * Phase 8.9: when the requested metric has no available execution
 * capability, look for other real, currently-supported Domain-declared
 * metrics that could execute this exact same request shape - same
 * operation, same filters/scope - in its place. Not a new similarity or
 * scoring model: a candidate qualifies only by satisfying the same three
 * checks the rest of the runtime already applies to the requested metric
 * itself (the operation-appropriate capability flag, Phase 8.5's
 * found/enabled template-existence check, and Phase 8.8's own filter-
 * compatibility check above) - "same category" is deliberately not one of
 * them, since two metrics sharing a category may still query entirely
 * different, independently-unavailable tables. Returns candidates in
 * `runtime.domain.metrics`' own declaration order; never scored or
 * ranked.
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
 * Phase 3.6 (LLM-First Front Door, 2026-09-18): staged-rollout feature
 * flag for Layer 0.5 (see the doc comment above its call site below).
 * Read directly from the process environment - a generic ops toggle,
 * not a Healthcare-specific concern, so this does not cross the
 * Universal-vs-Domain boundary any more than
 * packages/llm-model-gateway's own direct `process.env.*` reads for
 * provider API keys already do. Read via `globalThis` rather than a
 * bare `process` reference so this package needs no new `@types/node`
 * dependency (packages/runtime-engine has never previously touched
 * process env - keeping the diff to exactly the 2 files this task
 * scopes real logic changes to, per its own Decision Ladder guardrail).
 * Defaults to disabled: the pre-existing conditional-on-failure Layer 1
 * behavior remains the production default until this flag is
 * explicitly set to the literal string "true".
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
   * LLM Integration Layer 1 (Messy Input Normalizer): optional hook,
   * supplied only by the orchestrator's bootstrap (wired to
   * llmGateway.normalizeMessyLanguage()) - Universal Core stays 100%
   * LLM-unaware when this is omitted (every pre-existing caller,
   * including every verification script). Called only when the
   * "semantic-incomplete" dead end fires; its return value is NEVER
   * trusted as answerable on its own - a `canonicalQuestion` rewrite is
   * re-run through this exact same engine's full pipeline (see the
   * execute() wrapper below) before it can produce a real result. A
   * `clarification` reply (PrePhase 9.5) is never re-run - it only
   * replaces the gate's raw error text with the LLM's own natural-
   * language follow-up question, for cases where guessing a rewrite
   * would require inventing a scope (e.g. a state) the user never gave.
   *
   * `meta` (R7): optional opaque diagnostics from whatever answered (which
   * service, attempts, latency). Layer 0.5 records it verbatim as `detail` on
   * the "llm-normalization" trace entry and never reads it; a result with only
   * `meta` means "no usable answer" and is traced as "unavailable".
   *
   * `unsupportedTerms` (Batch 1, Step 1.3): the hook declining the question
   * AND naming what it asks for that the domain cannot answer. Unlike "no
   * usable answer" this is binding: Layer 0.5 refuses the request (0 SQL)
   * instead of running the deterministic pipeline on the raw text, where
   * those words would be silently dropped. A hook that cannot name the terms
   * keeps returning `{ meta }` / `null` and the pipeline still gets its turn.
   */
  llmFallback?: (question: string) => Promise<
    | { canonicalQuestion: string; meta?: PhaseGateDetail }
    | { clarification: string; meta?: PhaseGateDetail }
    | { unsupportedTerms: readonly string[]; meta?: PhaseGateDetail }
    | { meta: PhaseGateDetail }
    | null
  >;
  /**
   * Bug L Beyond (Phase 2, 2026-09-17): optional hook, supplied only by
   * the orchestrator's bootstrap - a domain-owned, deterministic,
   * synchronous rewrite of the raw question text applied BEFORE
   * anything else (semantic resolution, the tracer, Layer 1). Universal
   * Core never inspects what this does or which words it rewrites; it
   * only ever calls whatever function the wiring layer supplies, exactly
   * as `llmFallback` above already works. This exists so a Domain SDK
   * can deterministically expand its own domain-specific short forms
   * (e.g. Healthcare's own US state abbreviations) using a signal
   * (letter case) that is destroyed by the time the request reaches
   * `semantic.resolve()` - see `HealthcareEntityProvider`'s own
   * documented reason for never registering abbreviations in its
   * case-insensitive `STATES` map. Applied once, unconditionally, at
   * the very top of `execute()` - safe to also run on an already-
   * expanded or LLM-rewritten question (a idempotent no-op when no
   * matching short form is present).
   */
  preprocessQuestion?: (question: string) => string;
  /**
   * Batch 5C: optional, supplied by the orchestrator's bootstrap next to `llmFallback`: the domain's own deterministic
   * scope check (the topics it knows it cannot answer, matched exactly on whole words; no model, no SQL, returns the topics
   * found). Layer 0.5 runs it inside `llmFallback`, but a question the deterministic layers already understood (a named
   * entity, a suggestion chip) skips Layer 0.5 and with it that check, so "was <hospital> better 5 years ago" was answered as
   * a question about the hospital with the time ask dropped. Here it also runs on those questions, on what is left of the
   * question after the words of every resolved entity are removed (an entity whose own name contains a topic word is not a
   * request for that topic). A hit is the same binding refusal a model decline is (0 SQL). Ignored unless the front door is on.
   */
  unsupportedPrecheck?: (question: string) => readonly string[];
};

/** The words of `normalizedQuery` left after every resolved entity's own words are taken out (both are already normalized). */
function withoutEntityPhrases(normalizedQuery: string, matches: readonly { semanticType: string; phrase: string }[]): string {
  return matches
    .filter((match) => match.semanticType === "entity")
    .reduce((text, match) => text.split(` ${match.phrase} `).join(" "), ` ${normalizedQuery} `)
    .trim();
}

export function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor,
  llmFallback,
  preprocessQuestion,
  unsupportedPrecheck,
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
      );

console.log("========== SEMANTIC RESULT ==========");
console.log(
  JSON.stringify(semanticResult, null, 2),
);
console.log("=====================================");

      // Tier0 Task 6: Layer 2 continuation structural identity
      // injection. A Turn 2 continuation whose request carries a
      // `forcedIdentityCandidate` already pinned down exactly which
      // candidate the user meant in Turn 1 - re-deriving that same
      // identity from the reconstructed question's text alone is not
      // safe to assume (see RuntimeRequest.forcedIdentityCandidate's own
      // doc comment): it can re-trigger the identical ambiguity Turn 1
      // already resolved. Matches the forced candidate's opaque `value`
      // against every ambiguity's own `candidates` list, by value only
      // (never by name or domain vocabulary, mirroring valuesMatch()'s
      // own by-value philosophy) - never trusting a value the offered
      // candidates didn't actually contain. Only ever resolves an
      // ambiguity that still exists on this fresh resolution; an entity
      // that already resolved (successfully or not) through the
      // ordinary text pipeline is left untouched.
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

      // Phase 8.1: an entity mention resolved to more than one legitimate
      // candidate identity (e.g. two real hospitals sharing the same
      // name). Previously this was indistinguishable from the phrase not
      // being understood at all - the mention was silently dropped and
      // the rest of the query could still execute as if it had never been
      // mentioned. Refuse honestly instead, before any planning or SQL
      // execution, and never silently choose one candidate.
      //
      // Phase 8.3: the refusal message is now a targeted clarification -
      // naming the ambiguous mention and its actual candidate labels,
      // when the Domain SDK supplies them - instead of a fixed generic
      // sentence.
      //
      // Post-8.3 gate-ordering fix: checked BEFORE `!semanticResult.resolved`
      // (previously checked after it). identityAmbiguities can be populated
      // even when nothing else in the query resolved (e.g. a bare entity
      // mention with no recognized metric) - `resolved` reflects a
      // completely separate signal (the matcher/ontology's own primary
      // canonicalKey resolution) and its falsity does not mean the
      // ambiguity information is any less real or any less useful. A
      // concrete, already-detected ambiguous-identity signal is always
      // more actionable than the generic "Unable to resolve question."
      // message, so it must not be discarded merely because some other,
      // unrelated part of semantic resolution also failed. The gate
      // itself (this check's condition, its whole-request-refusal
      // granularity) is otherwise unchanged from Phase 8.1/8.3.
      tracker.enter("entity-identity-ambiguity");

      // Batch 4: a named entity whose qualifying place holds none of its
      // candidates ("Memorial Hospital in Alabama") is refused, never
      // answered without the name and never turned into a question about
      // candidates the user did not ask about. 0 SQL.
      //
      // Not for a Layer 2 continuation: its identities are pinned by value
      // (`forcedIdentityCandidate`, `companionEntities`), and the reconstructed
      // text ends with the place the user just chose - which, in a comparison
      // ("compare memorial hospital vs CUERO REGIONAL HOSPITAL in CARTHAGE, IL"),
      // lands on the LAST named hospital and contradicts it. That "not found"
      // is an artifact of the appended qualifier, never a fact about the
      // request (Turn 1 would already have refused a real one). Refusing here
      // dropped the second hospital of every comparison Turn 2.
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

        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: `I couldn't find a ${missing.entityId} matching "${missing.phrase}" in the place you named, so I can't answer about it. Check the name and the place, or ask about ${missing.entityId}s there in general.`,
          answerability: { status: "not_directly_answerable", reason: "data-unavailable" },
        };
      }

      if (semanticResult.identityAmbiguities && semanticResult.identityAmbiguities.length > 0) {
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

      // Batch 1 (Step 1.2): unaccounted-word gate for an LLM-rewritten
      // question. A word the user typed, that the rewrite kept and that no
      // semantic candidate accounted for (a qualifier the domain has no
      // vocabulary for) is a constraint the pipeline would silently drop and
      // answer without - a broader answer returned as if it satisfied the
      // request. Refused honestly before any planning or SQL (0 SQL, the same
      // `semantic-incomplete` reason as the dead end above, so the orchestrator
      // shows its usual guidance). Deliberately scoped to the rewritten run:
      // measured against the 600-query baseline this catches real drops with
      // no regression, while the same rule on a first pass would refuse
      // correct answers that merely carry a harmless extra word (filler or
      // comparison wording) - those first-pass words are judged by the LLM
      // (its `unsupported_terms`), not by vocabulary here.
      // A word the rewrite introduced itself is ignored (see
      // QueryPlanner.findUnaccountedWords). Domain-agnostic: no vocabulary.
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
        // Batch 5A-1: the scoped form of the same guard, and it ANNOTATES instead of refusing. The front door was
        // consulted for these words and could not read them, so the deterministic answer that follows must not
        // drop them silently: the trace records them and the caller says, in the answer, which words it ignored.
        //
        // Not a refusal because the recorded 600-query run says a refusal breaks working answers: of the 8 answered
        // rows whose front door gave no rewrite, refusing would have turned 4 correct ones into refusals (rows B001,
        // B014, D038, D058: harmless narration words) to fix 3 wrong ones. An annotation keeps every answer and
        // discloses every drop. Still 0 extra SQL and no effect on any gate. Not applied to every first pass (the
        // comment above): a question the deterministic layers fully understood never gets here, and one the front
        // door rewrote is judged by the rewritten-run guard.
        tracker.enter("unaccounted-word-guard");
        tracker.exit("unaccounted-word-guard", "annotated", 0, undefined, {
          unaccountedWords: frontDoorUnaccounted.join(" "),
          scope: "front-door-declined",
        });
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

      // Phase 8.4: a `relationship` candidate (e.g. "above"/"below") with
      // no `benchmark` candidate to compare against cannot cohere into a
      // valid interpretation - ExecutionPlanMapper.buildBenchmark() (RCG-009)
      // already requires both before building any benchmark, so without
      // this check the relationship word is silently dropped and the
      // query executes as an ordinary, unfiltered request: a materially
      // different, silently wrong answer returned as a success. Refused
      // honestly here, before any planning or SQL execution, reusing the
      // existing "candidate-inconsistent" reason (the same one RCG-010's
      // direction contradiction already uses) - both represent the same
      // underlying state: a semantic candidate set that does not cohere.
      if (hasRelationshipWithoutBenchmark(semanticResult.matches)) {
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

      // Tier0 Task 4 (F1): a more specific benchmark alias (e.g.
      // "national average") can be silently broken by a word inserted
      // between its own words (e.g. "national mortality average") -
      // PhraseExtractor only matches contiguous spans, so only a
      // generic fallback alias (e.g. bare "average" -> median) resolves
      // instead, and the query would otherwise execute successfully
      // against the wrong benchmark with no signal anything went wrong.
      // Refused honestly here, before any planning or SQL execution,
      // reusing the same "candidate-inconsistent" reason as the two
      // checks above - all three represent the same underlying state: a
      // semantic candidate set that does not safely cohere into one
      // interpretation.
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

// Pre-Phase 8: observe (never correct) whether every semantically
// resolved candidate ended up represented in the plan just built.
// Uses the raw, pre-collection candidate list (semanticResult.matches)
// rather than plan.plan.semantic, since some semantic types (e.g.
// "concept") are dropped by SemanticCollector before QueryPlan.semantic
// is even built and would otherwise be invisible to this check.
//
// Phase 8.2 (Blocker 1): plan.plan.semantic - QueryPlanner's own,
// already-filtered semantic collections (after filterMetricsForIntent()/
// filterFallbackMetrics()) - is passed as a third input so the metric
// check can tell a candidate legitimately removed by that existing
// filtering apart from one genuinely lost during planning. Nothing in
// QueryPlanner, ExecutionPlanMapper, or SemanticCollector changes;
// plan.plan.semantic was already computed and already in scope here.
const completeness = assessPlanCompleteness(
  semanticResult.matches,
  executionPlan,
  plan.plan.semantic,
);

console.log("========== PLAN COMPLETENESS ==========");
console.log(JSON.stringify(completeness, null, 2));
console.log("========================================");

// Phase 8.2: a genuinely unaccounted-for metric-type discrepancy - one
// that survived QueryPlanner's own legitimate filtering yet still never
// reached the ExecutionPlan - is refused before any SQL executes.
//
// Phase 8.8: a concept-type discrepancy is gated the same way. This is
// not a new detector - assessPlanCompleteness() already computes a
// concept-type discrepancy unconditionally for every concept candidate
// (SemanticCollector never collects "concept" into QueryPlan.semantic
// at all, so it can never legitimately reach the plan; unlike the
// metric/entity/benchmark branches, this one has no legitimate-
// suppression case to distinguish). Until now that evidence was
// computed and attached to `completeness` but never gated on, letting a
// recognized-but-unconsumed condition/topic (e.g. "...for heart attack
// specifically") silently execute against the metric's full,
// undifferentiated result. Category-type discrepancies (F13) remain
// detection-only, unchanged - category has no comparable "always a
// discrepancy" guarantee documented for its own branch, and gating on
// it was not part of the approved Phase 8.8 scope.
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

      // Phase 8.5: the semantic candidates resolved, planned, and mapped to
      // an ExecutionPlan cleanly, but no deterministic execution mechanism
      // exists for the requested shape at all (the Domain SDK never
      // registered a template under this id - e.g. RCG-008's deliberately
      // unregistered "-unsupported"/"-unbounded" ids). Distinct from every
      // gate above: this is not an ambiguity or a candidate inconsistency,
      // it is the simple absence of a capability. Refused honestly, before
      // any parameter resolution or SQL execution - existing failure
      // semantics (no SQL runs) are unchanged, only the classification is
      // now structured instead of a bare string.
      //
      // Phase 8.10 Layer 1: when Phase 8.9 discovered supported
      // alternatives, build a truthful guidance message from the Domain-
      // owned metric labels rather than a bare technical error. The
      // guidance renderer never executes SQL, never invents alternatives,
      // never handles user choice - only presents what Phase 8.9 already
      // proved exists.
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
const parameters = runtime.domain.executionStrategy.resolveParametersFromPlan
  ? runtime.domain.executionStrategy.resolveParametersFromPlan(executionPlan)
  : runtime.domain.executionStrategy.resolveParameters(
      plan.plan.parameters,
    );

console.log("========== PARAMETERS ==========");
console.log(parameters);
console.log("================================");

// Phase 8.8: the plan may already be complete (every resolved candidate
// reached ExecutionPlan.filters, per assessPlanCompleteness() above)
// while the template Domain execution strategy selected for THIS plan
// shape still cannot honor one of those filters - e.g. a single named
// entity's "=" filter reaching a generic, unscoped template that
// declares no parameter backed by that value at all (F8), or a
// multi-value "in" filter reaching a template parameter never declared
// as an "array" type - the only shape SqlExecutor's array-rendering is
// safe for (compare hospital-overall-rating-by-facility-ids.ts's own
// `facilityIds: array` parameter, the existing, correct use of this
// exact contract). Checked by VALUE (see valuesMatch()), not by name,
// so this stays fully Domain-agnostic even though a Domain's own
// parameter-resolution step may rename a filter's value onto a
// differently-named parameter. Refused honestly, before any SQL runs;
// no new answerability reason is invented, since none of the existing
// six accurately describes a generic plan/template shape mismatch (the
// same reasoning as the Phase 8.7 fallback for a raw executor failure).
//
// Tier1 Task 5 (Phase 1): previously scoped to "rank"/"aggregate"
// operations only, to avoid a false positive on a "lookup"/"compare"
// request's own redundant, coarser scalar filter alongside an already-
// resolved identity (e.g. a "state" filter alongside a "hospital"
// filter that already uniquely identifies one facility - confirmed
// live: "What is the overall rating of Mayo Clinic in Jacksonville,
// Florida?" - the single-entity lookup template has no "state"
// parameter at all and was never meant to). isFilterCompatibleWithTemplate()
// itself now only ever flags an "in"-operator filter (an unrepresented
// scalar "=" filter is unconditionally left alone, regardless of
// operation - see its own updated comment), so that same redundant-
// filter case remains unaffected here with no operation-based scoping
// needed at all: applying this check uniformly to every operation is
// what now lets a genuinely unsafe multi-value "in" filter (e.g. 2+
// resolved "state" entities reaching a template with no array-typed
// parameter to hold them) be caught before any SQL runs for a
// "lookup"/"compare" request too, closing a live Phase 8.13 invariant
// violation where such a request previously reached SqlExecutor
// unguarded and leaked a raw database error with sqlCalls>0 despite a
// `not_directly_answerable` classification.
const templateParameters = template.template.parameters ?? [];

tracker.enter("parameter-filter-compatibility");
const hasIncompatibleFilter = executionPlan.filters.some(
  (filter) => !isFilterCompatibleWithTemplate(filter, parameters, templateParameters),
);

if (hasIncompatibleFilter) {
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

// Phase 8.6B: the request already passed every prior gate (capability
// valid, parameters fully resolved) and genuinely executed - this is
// POST-HOC reclassification of an already-successful, already-real
// result, not a new query and not a new refusal mechanism. A zero-row
// result is data-unavailable ONLY when all of the following hold, so
// an ordinary, legitimate empty list/ranking/aggregate result (e.g.
// "hospitals in Wyoming" matching nothing) is never misclassified:
// (1) the operation is a single-record "lookup", not a list/ranking/
// aggregate/comparison/trend; (2) exactly one entity was resolved -
// not zero (no entity at all) and not more than one (Phase 7.5's
// explicit multi-entity comparison is a different mechanism); (3) the
// resolved template explicitly declares `singleEntityRecord: true` -
// a Domain-owned fact that THIS template's result represents that one
// entity's own record, never an enumeration of matching entities.
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
      // A requested metric must never silently disappear from a
      // "successful" response - fail the whole request, naming exactly
      // which metric could not be resolved.
      //
      // Phase 8.7: this bespoke failure return, unlike the capability-
      // unavailable gate above for the primary metric, never attached
      // an AnswerabilityResult - attached generically here for the same
      // reason as the primary-execution fallback above.
      //
      // Phase 8.9 (multi-metric sub-slice): the whole-request failure
      // itself is completely unchanged - still atomic, still the same
      // error text and status. The only addition is discovering
      // alternatives for THIS secondary metric (never the primary, never
      // any other secondary metric) via the exact same, unmodified
      // discoverAlternatives() the primary capability-unavailable gate
      // already uses - reused as-is, not reimplemented. The supported
      // primary result already computed above is never returned; it is
      // discarded along with the rest of this failure, exactly as before.
      //
      // Phase 8.10 Layer 1: when alternatives exist for the unavailable
      // secondary metric, build a truthful guidance message. The whole
      // request still fails atomically; guidance only makes the failure
      // message more helpful by presenting alternatives.
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
      // Phase 8.7: same generic fallback as above - this path never
      // attached an AnswerabilityResult before.
      //
      // Tier1 Task 6: this is a genuine execution-time failure (the
      // template exists and was found, unlike the capability-unavailable
      // gates above) - `secondaryResult.error` is a raw error string from
      // the SQL executor/database adapter and must never reach the user
      // verbatim (exactly the "raw SQL error on frontend" risk this task
      // closes). Replaced with a generic, non-leaking message; the raw
      // detail remains available server-side via logging/tracing, never
      // in this user-facing field.
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

return {
  ...primaryResult,
  completeness,
  answerability: { status: "answerable" },
  ...(coverageFacts.length > 0 ? { coverage: coverageFacts } : {}),
  executedParameters: parameters as Record<string, unknown>,
};
      };

      // LLM Integration Layer 0.5 (LLM-First Canonical Ingress
      // Normalizer, Phase 3.6, 2026-09-18): feature-flagged (see
      // isLlmFirstFrontDoorEnabled() above), defaulting to OFF so the
      // pre-existing Layer 1 (below) is the unmodified production
      // behavior until explicitly enabled. Calls the exact same
      // `llmFallback` hook Layer 1 already uses - not a new mechanism,
      // just a new trigger condition: unconditionally, BEFORE the
      // deterministic pipeline's first attempt, instead of only after
      // it fails. This matters because several real bugs this campaign
      // fixed (e.g. "safest hospitals in Texas" before its own alias
      // fix, "Huston, Texas" before its own typo fix) returned
      // `success:true` with silently WRONG data, never `success:false`
      // - Layer 1's on-failure trigger structurally never had a chance
      // to run for those cases at all.
      //
      // Skipped entirely for: a Layer-2 continuation re-execution
      // (`identityAlreadyResolved`/`forcedIdentityCandidate`/
      // `forcedIntent`/`companionEntities` present - these are short,
      // already-structured Turn 2 responses matched deterministically by
      // continuation.ts, not free natural language Layer 0.5 should
      // rewrite), an internal suggestion dry-run (`request.dryRun` -
      // already-clean, machine-generated candidate text), and a request
      // that already went through this exact path once
      // (`llmFallbackAttempted`, the same recursion guard Layer 1 below
      // already relies on).
      //
      // Fast-path bypass (narrow, deliberately conservative first cut -
      // see docs/LLM-FIRST-FRONT/05_IMPLEMENTATION_PLAN.md §2 step 1):
      // when the raw, unmodified question already contains a uniquely-
      // identified entity match (the concrete "tell me about Mayo
      // Clinic" example that motivated this bypass), skip Layer 0.5
      // entirely - an exact, already-registered proper name needs no
      // language normalization, and this guarantees zero added LLM
      // latency for that class of query, unchanged from today. This
      // does not attempt to replicate query-planner.ts's own, more
      // thorough `hasUnaccountedSubstantiveToken()` check (private to
      // that package, and not a signal `create-runtime-engine.ts` can
      // cheaply reuse without a 3rd file's worth of new exports) - a
      // query that isn't an exact unique-record match simply goes
      // through Layer 0.5, at the cost of one extra LLM round-trip for
      // some already-fine queries. That is a latency trade-off, never a
      // correctness one: the full, unmodified Phase 8 gate stack below
      // still runs on whatever text results either way.
      //
      // Second bypass (R7 follow-up, 2026-09-19 - found via frontend
      // testing): `planner.isFullyUnderstood()`. A question whose every
      // word the deterministic layers already resolved (a suggestion chip,
      // a canonical question, an aliased phrase like "goverment hospital
      // in CA") has nothing left for an LLM to fix - it can only change
      // what was already understood, and a chip is proven answerable by
      // its own dry-run, which never went through the LLM. It goes
      // straight to the deterministic pipeline. A typo, an unregistered
      // word ("heart pain") or a lowercase state code ("oh") is NOT fully
      // understood and still goes through Layer 0.5. If a fully-understood
      // question then fails deterministically, the on-failure Layer 1
      // below still gets its one attempt (`preNormalizeAttempted` stays
      // false), exactly as with the flag off.
      //
      // Never trusted directly: a `canonicalQuestion` rewrite is handed
      // to a fresh recursive `engine.execute()` (marked
      // `llmFallbackAttempted: true`), which re-runs the ENTIRE pipeline
      // - semantic resolution through every Phase 8 gate through
      // execution - from the top, exactly as if the user had typed the
      // canonical phrasing themselves. This function's own outer scope
      // never inspects or shortcuts what that recursive call decides.
      //
      // Phase 3.5 (chip validation parity): a dry run validates a suggestion chip, and a click on that chip is a
      // fresh question that meets the front door below. A chip the front door would send to the model (not every
      // word understood, no unique record) was validated on the deterministic path only, yet answered through the
      // model when clicked - a chip could pass here and fail on click ("... among non-profit facilities"). So a dry
      // run is refused, 0 SQL, whenever the same question would reach the model; the exact condition the front door
      // uses below.
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

      // LLM Integration Layer 1 (Messy Input Normalizer). PrePhase 9.5
      // broadened this from ONLY "semantic-incomplete" to any
      // non-ambiguous failure - live dogfooding (docs/Frontend test/
      // PrePhase 9 LLM.md) found real typo/near-miss questions
      // ("hospitals with best safty performence", "show me 3 start
      // hospital") failing at OTHER gates entirely - capability-
      // unavailable ("SQL template not found.") and missing-parameter
      // ("I don't have enough specific information...") - not just the
      // bare zero-candidate dead end. `status === "ambiguous"`
      // (identity-ambiguous) is the one deliberate exception: it already
      // has its own real clarification flow with real candidates, and an
      // LLM rewrite would only interfere with that pending interaction.
      // The rewrite is never trusted directly: delegating to a fresh
      // engine.execute() re-runs the ENTIRE pipeline (semantic
      // resolution through execution) on the rewritten text, so Rule
      // 21/22 and Phase 8.13 hold exactly as they would for a user who
      // typed the canonical phrasing themselves - this outer wrapper
      // never inspects or shortcuts what that recursive call decides. If
      // the rewrite doesn't help (still fails, or is identical to the
      // original), the ORIGINAL result - whatever gate it came from,
      // including any guidance message it already carries - is returned
      // completely unchanged, never replaced with something worse.
      //
      // Layer 0.5 (above) already spent this request's one LLM attempt
      // when `preNormalizeAttempted` is true - its own clarification (if
      // any) is overlaid first, and this block is skipped rather than
      // spending a second, redundant LLM call on the same original text.
      //
      // `!request.dryRun` (LLM call-count audit, R1): a suggestion-
      // validation dry-run is a machine-generated candidate proving "would
      // this be answerable" - when it fails it is because of a CAPABILITY
      // gap (e.g. a metric with no ranking template), never wording an LLM
      // could fix. Without this term every failing candidate spent a full
      // ~3.8K-token normalizer call (measured: ~40% of successful queries,
      // flag ON or OFF). A dry-run never executes SQL, so Phase 8.13 is
      // untouched; the failing candidate is simply dropped, as it always
      // effectively was.
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

      tracker.exit(
        "response",
        result.success ? "ok" : "refused",
        result.rowCount ?? 0,
        result.answerability?.status,
      );

      const finalResult: RuntimeResult = { ...result, trace: tracker.gates };

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

        // Tier1 T6 regression fix (bug 3 - production latency): validates
        // each candidate with `dryRun: true`, which runs the full
        // pipeline (semantic resolution, planning, template/capability
        // selection, filter compatibility) but returns BEFORE the actual
        // SQL execution gate (see the `request.dryRun` short-circuit
        // above `deterministic-warehouse-execution`) - proving the
        // candidate is answerable without a live warehouse round-trip.
        // `includeSuggestions` is deliberately omitted so a candidate
        // never recursively spawns suggestions of its own. Accepted
        // trade-off: this proves "would be answerable," not "does
        // return 1+ real rows" the way an actual execution would -
        // mitigated by candidates only ever being drawn from patterns
        // already known to have real data (nationwide/major-state
        // phrasings, or the Domain's own pre-verified fallback strings),
        // and independently spot-checked with real execution by
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
