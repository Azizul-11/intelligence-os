import type { SemanticCandidate } from "@intelligence/semantic";
import type { EntityDefinition } from "@intelligence/domain-sdk";
import type { ExecutionPlan } from "@intelligence/contracts";
import type { SemanticCollections } from "./semantic-collections";

/**
 * Pre-Phase 8 semantic-completeness check.
 *
 * A single semantic candidate the semantic layer resolved with
 * reasonable confidence, but which never ends up represented anywhere
 * in the final ExecutionPlan, is exactly the shape behind several
 * confirmed DOGFOODING 2.0 silent-wrong findings (F12, F13): the
 * request looks fully answered (`success:true`) while a part of what
 * was understood silently never reached execution.
 *
 * This is a detection/observation boundary only. It never rewrites a
 * candidate, corrects a plan, guesses intent, or changes the answer -
 * it only reports which resolved candidates were not accounted for, so
 * a future Phase 8 answerability layer can decide what to do about it.
 *
 * Phase 8.2: `plannedSemantic` is `QueryPlan.semantic` - QueryPlanner's
 * own already-filtered collections (after `filterMetricsForIntent()`/
 * `filterFallbackMetrics()`), passed through unmodified by the caller.
 * A raw metric candidate absent from `plannedSemantic.metrics` was
 * legitimately removed by that existing, unmodified planner filtering
 * and is never a discrepancy; only a candidate that survived filtering
 * but is still absent from the built ExecutionPlan is genuinely
 * unaccounted for. No new filtering mechanism is introduced - this only
 * reads a value the planner already computes. Entity/dimension/category/
 * concept/benchmark checks below are unaffected: none of them undergo
 * any comparable planner-level filtering today (confirmed by direct
 * inspection of QueryPlanner.createPlan()), so their existing legitimate-
 * suppression handling (see each branch below) remains exactly as it was.
 *
 * Known, deliberate scope limit: relationship-typed candidates are not
 * checked. Their consumption paths (ExecutionPlanMapper.buildBenchmark()
 * and buildOrdering()'s below-comparison signal) are conditional on
 * operation/benchmark context in ways not yet proven safe to check
 * without live evidence risking false positives - see the Pre-Phase 8
 * documentation for the full investigation.
 */

export interface PlanCompletenessDiscrepancy {
  semanticType: SemanticCandidate["semanticType"];
  phrase: string;
  canonicalKey: string;
  reason: string;
}

export interface PlanCompletenessReport {
  complete: boolean;
  discrepancies: PlanCompletenessDiscrepancy[];
}

export function assessPlanCompleteness(
  candidates: readonly SemanticCandidate[],
  plan: ExecutionPlan,
  plannedSemantic: SemanticCollections,
): PlanCompletenessReport {
  const discrepancies: PlanCompletenessDiscrepancy[] = [];

  const planMetricKeys = new Set<string>([
    plan.metric,
    ...(plan.metrics?.map((metric) => metric.metric) ?? []),
  ]);

  // Phase 8.2 (Blocker 1): the set of metric canonicalKeys that survived
  // QueryPlanner's own legitimate filtering (filterMetricsForIntent()/
  // filterFallbackMetrics()) and were actually planned. A raw candidate
  // missing from this set was intentionally removed by that existing
  // logic, not silently lost.
  const plannedMetricKeys = new Set(
    plannedSemantic.metrics.map((metric) => metric.canonicalKey),
  );

  const filterValues = new Set<unknown>();

  for (const filter of plan.filters) {
    if (Array.isArray(filter.value)) {
      for (const value of filter.value) {
        filterValues.add(value);
      }
    } else {
      filterValues.add(filter.value);
    }
  }

  const groupingDimensions = new Set(plan.grouping?.dimensions ?? []);

  // RCG-009's own longest-span-wins rule already decides which single
  // benchmark candidate is expected to survive - re-derive the same
  // selection here rather than inventing a second policy.
  const benchmarkCandidates = candidates.filter(
    (candidate) => candidate.semanticType === "benchmark",
  );

  const primaryBenchmark = [...benchmarkCandidates].sort(
    (a, b) => (b.end - b.start) - (a.end - a.start),
  )[0];

  const hasRelationship = candidates.some(
    (candidate) => candidate.semanticType === "relationship",
  );

  for (const candidate of candidates) {
    if (candidate.semanticType === "metric") {
      // Phase 8.2 (Blocker 1): a candidate legitimately removed by
      // filterMetricsForIntent()/filterFallbackMetrics() never reached
      // planning at all - it is not a discrepancy, it is intentional.
      if (!plannedMetricKeys.has(candidate.canonicalKey)) {
        continue;
      }

      if (!planMetricKeys.has(candidate.canonicalKey)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason:
            "Resolved metric candidate does not appear in plan.metric or plan.metrics.",
        });
      }

      continue;
    }

    if (candidate.semanticType === "entity") {
      const definition = candidate.definition as EntityDefinition;

      if (!definition.execution) {
        // Legitimate: ExecutionPlanMapper.buildFilters() only ever
        // builds a filter for an entity type the domain has declared
        // execution metadata for. An entity type with none is not
        // contractually expected to contribute a filter at all.
        continue;
      }

      const value = candidate.resolvedValue ?? candidate.phrase;

      if (!filterValues.has(value)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason:
            "Resolved entity candidate's value does not appear in any plan.filters entry.",
        });
      }

      continue;
    }

    if (candidate.semanticType === "dimension") {
      if (!groupingDimensions.has(candidate.canonicalKey)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason:
            "Resolved dimension candidate does not appear in plan.grouping.",
        });
      }

      continue;
    }

    if (candidate.semanticType === "category") {
      // SemanticCollector.collect() buckets category candidates, but
      // no existing mechanism anywhere in ExecutionPlanMapper reads
      // that bucket - there is no proven suppression policy here, only
      // an architectural gap (F13).
      discrepancies.push({
        semanticType: candidate.semanticType,
        phrase: candidate.phrase,
        canonicalKey: candidate.canonicalKey,
        reason:
          "Category candidates are not consumed by any existing planning mechanism.",
      });

      continue;
    }

    if (candidate.semanticType === "concept") {
      // Not bucketed by SemanticCollector.collect() at all - a concept
      // candidate never reaches QueryPlan.semantic, let alone
      // ExecutionPlan (F12).
      discrepancies.push({
        semanticType: candidate.semanticType,
        phrase: candidate.phrase,
        canonicalKey: candidate.canonicalKey,
        reason:
          "Concept candidates are not collected by SemanticCollector and never reach the planner.",
      });

      continue;
    }

    if (candidate.semanticType === "benchmark") {
      if (!hasRelationship) {
        // Legitimate: ExecutionPlanMapper.buildBenchmark() requires a
        // relationship candidate before building any benchmark at all.
        continue;
      }

      if (candidate === primaryBenchmark) {
        if (plan.benchmark?.benchmark !== candidate.canonicalKey) {
          discrepancies.push({
            semanticType: candidate.semanticType,
            phrase: candidate.phrase,
            canonicalKey: candidate.canonicalKey,
            reason:
              "The most specific resolved benchmark candidate does not match plan.benchmark.",
          });
        }
      }

      // A non-primary benchmark candidate is legitimately superseded
      // by buildBenchmark()'s own existing longest-span-wins rule.
      continue;
    }

    // candidate.semanticType === "relationship": not checked, by
    // documented design (see the module comment above).
  }

  return {
    complete: discrepancies.length === 0,
    discrepancies,
  };
}
