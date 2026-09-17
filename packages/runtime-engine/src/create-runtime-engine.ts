import type { DomainRuntime } from "@intelligence/domain-runtime";
import type { QueryPlanner, ExecutionPlanMapper } from "@intelligence/query-planner";
import { assessPlanCompleteness, hasRelationshipWithoutBenchmark, detectSubsumedBenchmarkRisk } from "@intelligence/query-planner";
import type { SqlExecutor } from "@intelligence/sql-executor";
import type { SemanticResolver } from "@intelligence/semantic";
import type { ExecutionPlan, ExecutionFilter } from "@intelligence/contracts";
import type { MetricDefinition, SqlTemplateParameter, SuggestionContext } from "@intelligence/domain-sdk";

import type { RuntimeEngine } from "./runtime-engine";
import type { RuntimeRequest } from "./runtime-request";
import type { RuntimeResult } from "./runtime-result";
import type { CoverageFact } from "./coverage-fact";
import { buildClarificationMessage } from "./build-clarification-message";
import { buildGuidanceMessage } from "./build-guidance-message";
import { PhaseGateTracker } from "./phase-gate-tracker";

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
   */
  llmFallback?: (
    question: string,
  ) => Promise<{ canonicalQuestion: string } | { clarification: string } | null>;
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
};
export function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor,
  llmFallback,
  preprocessQuestion,
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
};
      };

      let result = await runPipeline();

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
      if (
        !result.success &&
        result.answerability?.status !== "ambiguous" &&
        llmFallback &&
        !request.llmFallbackAttempted
      ) {
        const rewrite = await llmFallback(request.question);
        if (
          rewrite &&
          "canonicalQuestion" in rewrite &&
          rewrite.canonicalQuestion !== request.question
        ) {
          return engine.execute({
            ...request,
            question: rewrite.canonicalQuestion,
            llmFallbackAttempted: true,
          });
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
        if (rewrite && "clarification" in rewrite) {
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
        return { ...finalResult, suggestions: candidateQuestions.slice(0, 3) };
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
