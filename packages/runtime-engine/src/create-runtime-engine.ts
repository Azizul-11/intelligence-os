import type { DomainRuntime } from "@intelligence/domain-runtime";
import type { QueryPlanner, ExecutionPlanMapper } from "@intelligence/query-planner";
import { assessPlanCompleteness, hasRelationshipWithoutBenchmark } from "@intelligence/query-planner";
import type { SqlExecutor } from "@intelligence/sql-executor";
import type { SemanticResolver } from "@intelligence/semantic";

import type { RuntimeEngine } from "./runtime-engine";
import type { RuntimeRequest } from "./runtime-request";
import type { RuntimeResult } from "./runtime-result";
import { buildClarificationMessage } from "./build-clarification-message";

type CreateRuntimeEngineOptions = {
  runtime: DomainRuntime;
  semantic: SemanticResolver;
  planner: QueryPlanner;
  executionPlanMapper: ExecutionPlanMapper;
  executor: SqlExecutor;
};
export function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor,
}: CreateRuntimeEngineOptions): RuntimeEngine {
  return {
    async execute(request: RuntimeRequest): Promise<RuntimeResult> {
      console.log(">>> RuntimeEngine.execute()");
      const semanticResult = semantic.resolve(request.question);

console.log("========== SEMANTIC RESULT ==========");
console.log(
  JSON.stringify(semanticResult, null, 2),
);
console.log("=====================================");

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
        };
      }

      if (!semanticResult.resolved) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "Unable to resolve question.",
          answerability: { status: "not_directly_answerable" },
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

      // Fix Cycle 018 (Option A): pass the active domain's full,
      // already-declared metric list through opaquely, so QueryPlanner
      // can discover a domain-declared `comparable` set for a
      // metric-less multi-entity request. Universal Core never inspects
      // this list beyond the generic `comparable` flag.
      const plan = planner.createPlan(semanticResult, runtime.domain.metrics);

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
const executionPlan = executionPlanMapper.map(plan.plan);

console.log("========== EXECUTION PLAN ==========");
console.log(JSON.stringify(executionPlan, null, 2));
console.log("====================================");

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
// reached the ExecutionPlan - is refused before any SQL executes. Every
// other discrepancy type (concept/F12, category/F13, entity, dimension,
// benchmark) remains detection-only, exactly as it was before Phase 8.2:
// still reported via `completeness` below, never gated on here. Only the
// metric reconciliation this phase specifically analyzed and resolved
// is treated as a hard stop.
const hasUnaccountedMetricLoss = completeness.discrepancies.some(
  (discrepancy) => discrepancy.semanticType === "metric",
);

if (hasUnaccountedMetricLoss) {
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

      if (!template.found || !template.template) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "SQL template not found.",
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

const primaryResult = await executor.execute(
  template.template,
  parameters,
);

if (!primaryResult.success) {
  return primaryResult;
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
      return {
        success: false,
        rows: [],
        rowCount: 0,
        error: `SQL template not found for requested metric "${secondaryMetric.metric}".`,
      };
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
      return {
        success: false,
        rows: [],
        rowCount: 0,
        error: `Failed to execute requested metric "${secondaryMetric.metric}": ${secondaryResult.error ?? "unknown error"}`,
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

return { ...primaryResult, completeness, answerability: { status: "answerable" } };
    },
  };
}
